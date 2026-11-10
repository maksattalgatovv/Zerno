"""Demo data: ZERNO Demo Farm, Akmola Region. Run with ``python -m app.seed``.

All coordinates, missions and readings here are fictional sample data. Re-running replaces
the demo account's data and leaves other accounts untouched.
"""

import logging
import math
import secrets
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.adapters.storage import get_storage
from app.adapters.vision.demo import DemoVisionModel
from app.core.security import hash_password
from app.db import models as m
from app.db.session import SessionLocal
from app.domain.flight import estimate_flight
from app.domain.geo import METERS_PER_DEG_LAT, LatLng, centroid, polygon_area_ha, split_quad
from app.domain.ndvi import classify_ndvi, summarize_ndvi
from app.services.livestock import apply_event
from app.services.sample_data import sample_ndvi_grid, sample_photo

log = logging.getLogger("zerno.seed")

DEMO_EMAIL = "demo@zerno.farm"
BASE: LatLng = (51.700, 71.100)
HOME_OFFSET = (350, 215)
REGION = "Akmola Region"
WEEKS = 10

FIELDS = [
    {
        "name": "field.north", "area": 110, "crop": "wheat", "days_planted": 74, "ndvi": 0.74,
        "start": 0.58, "corners": [(-900, 1150), (400, 1170), (420, 280), (-880, 250)],
        "zones": {"nw": 0.76, "ne": 0.75, "sw": 0.72, "se": 0.73},
    },
    {
        "name": "field.river", "area": 85, "crop": "wheat", "days_planted": 71, "ndvi": 0.52,
        "start": 0.61, "corners": [(-900, 150), (150, 170), (180, -640), (-920, -660)],
        "zones": {"nw": 0.61, "ne": 0.57, "sw": 0.47, "se": 0.43},
    },
    {
        "name": "field.east", "area": 55, "crop": "barley", "days_planted": 72, "ndvi": 0.36,
        "start": 0.57, "corners": [(560, 760), (1230, 780), (1260, -40), (540, -60)],
        "zones": {"nw": 0.46, "ne": 0.33, "sw": 0.41, "se": 0.28},
    },
    {
        "name": "field.pasture", "area": 70, "crop": "pasture", "days_planted": None, "ndvi": 0.63,
        "start": 0.55, "corners": [(-900, -800), (300, -780), (320, -1500), (-880, -1520)],
        "zones": {"nw": 0.66, "ne": 0.64, "sw": 0.61, "se": 0.6},
    },
]
PASTURE = 3

# field index, zone, type, severity, area_ha, days ago, resolved
ANOMALIES = [
    (1, "se", "water_stress", "warning", 6.4, 2, False),
    (1, "sw", "nutrient", "warning", 3.1, 5, False),
    (2, "ne", "disease", "critical", 4.2, 1, False),
    (2, "se", "water_stress", "critical", 7.8, 1, False),
    (2, "nw", "weeds", "warning", 1.6, 12, True),
    (0, "se", "weeds", "warning", 0.9, 16, True),
]

# species, name, on the pasture?, starting count, then (kind, quantity, days ago) in date order.
# A drone_count entry is filled in from a seeded counting flight on that day.
HERDS = [
    ("cattle", "herd.dairy", True, 64, [("birth", 5, 40), ("drone_count", 69, 22), ("sale", 3, 21), ("birth", 2, 6)]),
    ("cattle", "herd.beef", True, 48, [("purchase", 12, 30), ("drone_count", 60, 22), ("sale", 8, 9)]),
    ("sheep", "herd.sheep", True, 310, [("birth", 46, 35), ("drone_count", 353, 22), ("death", 2, 18), ("sale", 20, 4)]),
    ("horse", "herd.horses", True, 22, [("birth", 3, 25), ("drone_count", 25, 22)]),
    ("poultry", "herd.hens", False, 180, [("purchase", 40, 14), ("recount", 214, 2)]),
]
COUNT_FLIGHT_DAYS = 22


def _polygon(corners: list[tuple[float, float]], area_ha: float) -> list[LatLng]:
    """Metre offsets from BASE into lat/lng, scaled so the polygon matches the area."""
    scale_lng = METERS_PER_DEG_LAT * math.cos(math.radians(BASE[0]))
    points = [(BASE[0] + y / METERS_PER_DEG_LAT, BASE[1] + x / scale_lng) for x, y in corners]
    center = centroid(points)
    factor = math.sqrt(area_ha / polygon_area_ha(points))
    return [(round(center[0] + (p[0] - center[0]) * factor, 6),
             round(center[1] + (p[1] - center[1]) * factor, 6)) for p in points]


def _curve(start: float, end: float, step: int, wiggle_seed: int) -> float:
    fraction = step / (WEEKS - 1)
    wiggle = math.sin(step * 1.7 + wiggle_seed) * 0.012 * (1 - fraction)
    return round(start + (end - start) * fraction + wiggle, 3)


def _add_history(db: Session, field: m.Field, spec: dict, index: int, today: date) -> None:
    final = field.ndvi_mean
    for step in range(WEEKS):
        day = today - timedelta(days=(WEEKS - 1 - step) * 7 + 1)
        field.ndvi_mean = _curve(spec["start"], spec["ndvi"], step, index)
        stats = summarize_ndvi(sample_ndvi_grid(field, day))
        stats["mean"] = field.ndvi_mean
        db.add(m.NdviRecord(field_id=field.id, recorded_on=day, source="demo", **stats))
    field.ndvi_mean = final


def _seed_mission(db: Session, drone: m.Drone, field: m.Field, days_ago: int, *,
                  status: str = "completed", altitude: float = 60, photos: int = 3,
                  return_reason: str | None = None, progress: float = 1.0,
                  owner: m.User, purpose: str = "survey") -> m.DroneMission:
    polygon = [tuple(p) for p in field.coordinates]
    home = (drone.home_lat, drone.home_lng)
    estimate = estimate_flight(polygon, home, altitude)
    started = datetime.now(UTC) - timedelta(days=days_ago, hours=3)
    used = estimate.battery_needed * progress
    mission = m.DroneMission(
        drone_id=drone.id, field_id=field.id, status=status,
        created_at=started - timedelta(minutes=10),
        started_at=started,
        completed_at=started + timedelta(minutes=estimate.duration_min * progress),
        flight_data={
            "purpose": purpose, "simulated": True, "route": [list(p) for p in estimate.route], "home": list(home),
            "altitude_m": altitude, "distance_m": estimate.distance_m,
            "duration_min": estimate.duration_min, "battery_needed": estimate.battery_needed,
            "preflight": [], "track": [], "progress": progress, "phase": "landed",
            "photos_taken": photos, "battery_start": 96, "battery": round(96 - used, 1),
            "position": list(home), "return_reason": return_reason,
        },
    )
    db.add(mission)
    db.flush()
    storage = get_storage()
    for i in range(photos):
        key = f"public/missions/{mission.id}/{uuid.uuid4().hex}.jpg"
        weak = max(0.03, 0.75 - (field.ndvi_mean or 0.6))
        storage.save(key, sample_photo(f"{mission.id}{i}", yellow=weak * 0.7, brown=weak * 0.4))
        lat, lng = estimate.route[(i * len(estimate.route)) // max(photos, 1)]
        db.add(m.Image(user_id=owner.id, mission_id=mission.id, field_id=field.id, image_url=key,
                       gps_coordinates=[lat, lng], captured_at=mission.started_at, source="mission",
                       is_simulated=True))
    return mission


def _seed_analysis(db: Session, owner: m.User, field: m.Field, days_ago: int, colours: dict,
                   decision: tuple[str, str] | None) -> None:
    """Sample photos go through the real demo rules, so stored results stay honest."""
    key = f"public/demo/{uuid.uuid4().hex}.jpg"
    photo = sample_photo(key, **colours)
    get_storage().save(key, photo)
    when = datetime.now(UTC) - timedelta(days=days_ago)
    image = m.Image(user_id=owner.id, field_id=field.id, image_url=key, captured_at=when,
                    source="upload", is_simulated=True)
    db.add(image)
    db.flush()
    model = DemoVisionModel()
    result = model.analyze(photo, field.crop_type)
    analysis = m.AIAnalysis(
        user_id=owner.id, field_id=field.id, image_id=image.id, crop_type=field.crop_type,
        model_name=model.name, is_demo=True,
        result={
            "issue": result.issue, "symptoms": result.symptoms, "metrics": result.metrics,
            "annotations": [vars(a) for a in result.annotations],
        },
        confidence=result.confidence, recommendations=result.recommendations,
        needs_agronomist=result.needs_agronomist, created_at=when,
    )
    db.add(analysis)
    db.flush()
    if decision:
        db.add(m.FarmerAction(user_id=owner.id, analysis_id=analysis.id, decision=decision[0],
                              comment=decision[1], created_at=when + timedelta(hours=4)))


def seed_demo(db: Session) -> m.User:
    existing = db.scalar(select(m.User).where(m.User.email == DEMO_EMAIL))
    language = existing.language if existing else "en"
    # Keeping the id means sessions that are already signed in survive a reset.
    user_id = existing.id if existing else m.new_id()
    if existing:
        db.expunge(existing)
    db.execute(delete(m.User).where(m.User.email == DEMO_EMAIL))

    # The demo account signs in through /auth/demo, so its password stays random.
    owner = m.User(
        id=user_id, name="Aidar Serikov", email=DEMO_EMAIL, password_hash=hash_password(secrets.token_urlsafe(24)),
        role="farmer", language=language, is_demo=True,
        notification_prefs={"missions": True, "ai": True, "alerts": True},
        integration_prefs={"sim_speed": "normal"},
    )
    db.add(owner)
    db.flush()
    farm = m.Farm(owner_id=owner.id, name="ZERNO Demo Farm", region=REGION,
                  location="Shortandy district, Kazakhstan (fictional)",
                  latitude=BASE[0], longitude=BASE[1], main_crop="wheat")
    db.add(farm)
    db.flush()

    today = date.today()
    now = datetime.now(UTC)
    fields: list[m.Field] = []
    for index, spec in enumerate(FIELDS):
        polygon = _polygon(spec["corners"], spec["area"])
        center = centroid(polygon)
        field = m.Field(
            farm_id=farm.id, name=spec["name"], region=REGION, area=spec["area"],
            crop_type=spec["crop"], coordinates=[list(p) for p in polygon],
            center_lat=round(center[0], 6), center_lng=round(center[1], 6),
            planting_date=today - timedelta(days=spec["days_planted"]) if spec["days_planted"] else None,
            last_monitored_at=now - timedelta(days=index + 1),
            health_status=classify_ndvi(spec["ndvi"]), ndvi_mean=spec["ndvi"],
            created_at=now - timedelta(days=(spec["days_planted"] or 120) + 3),
        )
        db.add(field)
        for zone_name, quad in split_quad(polygon).items():
            ndvi = spec["zones"][zone_name]
            field.zones.append(m.Zone(name=f"zone.{zone_name}", polygon=[list(p) for p in quad],
                                      ndvi=ndvi, health_status=classify_ndvi(ndvi)))
        fields.append(field)
    db.flush()

    for field_index, zone_name, kind, severity, area, days, resolved in ANOMALIES:
        field = fields[field_index]
        zone = next(z for z in field.zones if z.name == f"zone.{zone_name}")
        lat, lng = centroid([tuple(p) for p in zone.polygon])
        field.anomalies.append(m.Anomaly(
            zone_id=zone.id, type=kind, severity=severity, latitude=lat, longitude=lng, area_ha=area,
            status="resolved" if resolved else "open", detected_at=now - timedelta(days=days),
            is_simulated=True,
        ))
    db.flush()

    for index, (field, spec) in enumerate(zip(fields, FIELDS)):
        _add_history(db, field, spec, index, today)

    scale_lng = METERS_PER_DEG_LAT * math.cos(math.radians(BASE[0]))
    home = (BASE[0] + HOME_OFFSET[1] / METERS_PER_DEG_LAT, BASE[1] + HOME_OFFSET[0] / scale_lng)
    scout = m.Drone(farm_id=farm.id, model="Scout S1 (simulated)", serial="SIM-0001",
                    adapter="simulated", status="idle", battery_level=92,
                    home_lat=round(home[0], 6), home_lng=round(home[1], 6))
    spare = m.Drone(farm_id=farm.id, model="Scout S2 (simulated)", serial="SIM-0002",
                    adapter="simulated", status="idle", battery_level=48,
                    home_lat=round(home[0], 6), home_lng=round(home[1], 6))
    db.add_all([scout, spare])
    db.flush()

    _seed_mission(db, spare, fields[1], 9, status="aborted", progress=0.62, photos=2,
                  return_reason="low_battery", owner=owner)
    missions = [
        _seed_mission(db, scout, fields[0], 3, owner=owner),
        _seed_mission(db, scout, fields[1], 2, owner=owner),
        _seed_mission(db, scout, fields[2], 1, owner=owner),
    ]
    scout.last_mission = missions[-1].id
    scout.last_mission_at = missions[-1].completed_at

    _seed_analysis(db, owner, fields[0], 3, {"green": 0.96, "yellow": 0.02, "brown": 0.02}, ("approved", ""))
    _seed_analysis(db, owner, fields[1], 2, {"green": 0.6, "yellow": 0.36, "brown": 0.04},
                   ("approved", "Soil sample booked for this week."))
    _seed_analysis(db, owner, fields[2], 1, {"green": 0.52, "yellow": 0.1, "brown": 0.38}, None)

    count_flight = _seed_mission(db, scout, fields[PASTURE], COUNT_FLIGHT_DAYS, owner=owner, photos=2,
                                 purpose="livestock")
    counts = []
    for species, name, on_pasture, start, history in HERDS:
        group = m.LivestockGroup(farm_id=farm.id, species=species, name=name,
                                 field_id=fields[PASTURE].id if on_pasture else None,
                                 created_at=now - timedelta(days=60))
        db.add(group)
        db.flush()
        apply_event(group, "recount", start).created_at = now - timedelta(days=60)
        for kind, quantity, days in history:
            if kind == "drone_count":
                expected = group.head_count
                event = apply_event(group, kind, quantity, mission_id=count_flight.id, confidence=0.93,
                                    is_simulated=True)
                counts.append({"group_id": group.id, "group_name": name, "species": species,
                               "expected": expected, "counted": quantity, "confidence": 0.93})
            else:
                event = apply_event(group, kind, quantity)
            event.created_at = now - timedelta(days=days)
        group.updated_at = now - timedelta(days=history[-1][2])
    count_flight.flight_data = {**count_flight.flight_data, "livestock_counts": counts}
    db.flush()

    def add_notice(title: str, message: str, severity: str, days: float, *, params: dict | None = None,
                   link: str | None = None, read: bool = False) -> None:
        db.add(m.Notification(user_id=owner.id, title=title, message=message, severity=severity,
                              params=params or {}, link=link, read=read,
                              created_at=now - timedelta(days=days)))

    add_notice("notif.health_drop.title", "notif.health_drop.msg", "critical", 0.8,
               params={"field": "field.east"}, link=f"/fields/{fields[2].id}")
    add_notice("notif.anomaly.title", "notif.anomaly.msg", "warning", 1,
               params={"type": "anomaly.disease", "field": "field.east"}, link="/map")
    add_notice("notif.mission_done.title", "notif.mission_done.msg", "success", 1,
               params={"field": "field.east", "photos": 3}, link=f"/drone?mission={missions[2].id}")
    add_notice("notif.analysis.title", "notif.analysis.msg", "info", 1.2,
               params={"issue": "issue.water_stress"}, link="/ai-doctor", read=True)
    add_notice("notif.welcome.title", "notif.welcome.msg", "info", 4, link="/dashboard", read=True)

    db.commit()
    return owner


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        owner = seed_demo(db)
    log.info("Seeded demo account %s", owner.email)


if __name__ == "__main__":
    main()
