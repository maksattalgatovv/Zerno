"""Mission lifecycle: planning, safety gate, and ingesting results.

Result ingestion is adapter-agnostic: it is what a real drone's upload would call too.
"""

import logging
import uuid
from datetime import UTC, date, datetime

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.drone import get_drone_adapter
from app.adapters.storage import get_storage
from app.core.errors import ApiError
from app.db import models as m
from app.domain.flight import MAX_SAMPLE_PHOTOS, PreflightInput, estimate_flight, preflight_checks
from app.domain.geo import LatLng, centroid, polygon_area_ha, split_quad
from app.domain.ndvi import classify_ndvi, summarize_ndvi
from app.services.livestock import count_from_flight
from app.services.notifications import notify
from app.services.sample_data import _rng, sample_ndvi_grid, sample_photo

log = logging.getLogger("zerno.missions")

ACTIVE_STATUSES = ("in_progress", "returning")
ANOMALY_TYPES = ("water_stress", "nutrient", "weeds", "disease")
MIN_PROGRESS_FOR_INDEX = 0.5


def _preflight(drone: m.Drone, battery_needed: float, altitude_m: float) -> list[dict]:
    return preflight_checks(PreflightInput(
        connection=drone.connection_status, gps=drone.gps_status, battery=drone.battery_level,
        status=drone.status, battery_needed=int(battery_needed), altitude_m=altitude_m,
    ))


def plan_mission(db: Session, drone: m.Drone, field: m.Field, altitude_m: float,
                 purpose: str = "survey") -> m.DroneMission:
    if purpose == "livestock" and not db.scalar(
        select(m.LivestockGroup.id).where(m.LivestockGroup.field_id == field.id).limit(1)
    ):
        raise ApiError(409, "no_livestock_on_field")
    home: LatLng = (drone.home_lat, drone.home_lng)
    polygon = [tuple(p) for p in field.coordinates]
    estimate = estimate_flight(polygon, home, altitude_m)
    adapter = get_drone_adapter(drone.adapter)
    mission = m.DroneMission(
        drone_id=drone.id,
        field_id=field.id,
        status="planned",
        flight_data={
            "purpose": purpose,
            "simulated": bool(adapter and adapter.is_simulated),
            "route": [list(p) for p in estimate.route],
            "home": list(home),
            "altitude_m": altitude_m,
            "distance_m": estimate.distance_m,
            "duration_min": estimate.duration_min,
            "battery_needed": estimate.battery_needed,
            "preflight": _preflight(drone, estimate.battery_needed, altitude_m),
            "track": [],
            "progress": 0,
            "photos_taken": 0,
        },
    )
    db.add(mission)
    db.commit()
    return mission


def authorize_start(db: Session, mission: m.DroneMission, operator_confirmed: bool) -> None:
    """The safety gate. Nothing flies unless all of these hold, whatever the adapter."""
    if mission.status != "planned":
        raise ApiError(409, "mission_state")
    if not operator_confirmed:
        raise ApiError(400, "operator_required")

    drone = mission.drone
    adapter = get_drone_adapter(drone.adapter)
    if adapter is None or not adapter.available:
        raise ApiError(409, "adapter_unavailable")

    active = db.scalar(select(m.DroneMission.id).where(
        m.DroneMission.drone_id == drone.id, m.DroneMission.status.in_(ACTIVE_STATUSES)
    ))
    if active:
        raise ApiError(409, "drone_busy")

    data = mission.flight_data
    checks = _preflight(drone, data["battery_needed"], data["altitude_m"])
    mission.flight_data = {**data, "preflight": checks}
    if not all(c["passed"] for c in checks):
        db.commit()
        raise ApiError(409, "preflight_failed")


def ensure_zones(db: Session, field: m.Field) -> None:
    """Four-sided fields get quadrant zones the first time they are surveyed."""
    if field.zones or len(field.coordinates) != 4:
        return
    quad = [tuple(p) for p in field.coordinates]
    for name, polygon in split_quad(quad).items():
        field.zones.append(m.Zone(name=f"zone.{name}", polygon=[list(p) for p in polygon]))
    db.flush()


def update_index(db: Session, field: m.Field, mission: m.DroneMission, seed: str, user: m.User) -> None:
    """Record a new simulated vegetation-index observation for the field."""
    rng = _rng(seed, "index")
    today = date.today()
    previous = field.ndvi_mean if field.ndvi_mean is not None else float(rng.uniform(0.45, 0.72))
    field.ndvi_mean = round(float(np.clip(previous + rng.uniform(-0.02, 0.03), 0.1, 0.9)), 3)
    ensure_zones(db, field)
    for zone in field.zones:
        base = zone.ndvi if zone.ndvi is not None else field.ndvi_mean
        zone.ndvi = round(float(np.clip(base + rng.uniform(-0.03, 0.03), 0.05, 0.9)), 2)
        zone.health_status = classify_ndvi(zone.ndvi)

    if field.health_status != "healthy" and field.zones and rng.random() < 0.6:
        weakest = min(field.zones, key=lambda z: z.ndvi or 1)
        lat, lng = centroid([tuple(p) for p in weakest.polygon])
        kind = str(rng.choice(ANOMALY_TYPES))
        field.anomalies.append(m.Anomaly(
            zone_id=weakest.id, mission_id=mission.id, type=kind,
            severity="critical" if weakest.health_status == "critical" else "warning",
            latitude=lat, longitude=lng,
            area_ha=round(polygon_area_ha([tuple(p) for p in weakest.polygon]) * 0.1, 1),
            is_simulated=True,
        ))
        notify(db, user, "alerts", "notif.anomaly.title", "notif.anomaly.msg", severity="warning",
               params={"type": f"anomaly.{kind}", "field": field.name}, link="/map")

    stats = summarize_ndvi(sample_ndvi_grid(field, today))
    field.health_status = classify_ndvi(field.ndvi_mean)
    field.last_monitored_at = datetime.now(UTC)
    db.add(m.NdviRecord(
        field_id=field.id, mission_id=mission.id, recorded_on=today, source="simulated", **stats,
    ))


def report_emergency_flight(db: Session, mission: m.DroneMission, owner: m.User) -> None:
    """Add the outcome to the incident. A flight never closes it: only a person can."""
    data = mission.flight_data
    emergency = db.get(m.Emergency, data["emergency_id"])
    if emergency is None:
        return
    if mission.status != "completed":
        emergency.add_log("flight_stopped")
    else:
        emergency.add_log("suppress_done" if data.get("emergency_mode") == "suppress" else "recon_done")
    db.add(m.Notification(
        user_id=owner.id, title="notif.emergency_flight.title", message="notif.emergency_flight.msg",
        severity="critical", link="/emergency",
    ))


def ingest_results(db: Session, mission: m.DroneMission, photos: list[LatLng]) -> None:
    """Store everything a flight produced and tell the farmer."""
    field = mission.field
    owner = mission.drone.farm.owner
    data = mission.flight_data
    storage = get_storage()

    if data.get("emergency_id"):
        report_emergency_flight(db, mission, owner)
        return

    for index, position in enumerate(photos[:MAX_SAMPLE_PHOTOS]):
        key = f"public/missions/{mission.id}/{uuid.uuid4().hex}.jpg"
        rng = _rng(mission.id, index)
        weak = max(0.03, 1 - (field.ndvi_mean or 0.6) - 0.25)
        storage.save(key, sample_photo(
            f"{mission.id}-{index}", yellow=float(weak * rng.uniform(0.2, 1)),
            brown=float(weak * rng.uniform(0.1, 0.7)),
        ))
        db.add(m.Image(
            user_id=owner.id, mission_id=mission.id, field_id=field.id, image_url=key,
            gps_coordinates=list(position), source="mission", is_simulated=True,
        ))

    if data.get("purpose") == "livestock":
        # A partial flight would miss animals, so only a full pass changes the count.
        if mission.status == "completed":
            mission.flight_data = {**data, "livestock_counts": count_from_flight(db, mission, owner)}
            return
    elif data.get("progress", 0) >= MIN_PROGRESS_FOR_INDEX:
        update_index(db, field, mission, mission.id, owner)

    if mission.status == "completed":
        notify(db, owner, "missions", "notif.mission_done.title", "notif.mission_done.msg",
               severity="success", link=f"/drone?mission={mission.id}",
               params={"field": field.name, "photos": len(photos)})
    else:
        notify(db, owner, "missions", "notif.mission_aborted.title", "notif.mission_aborted.msg",
               severity="warning", link=f"/drone?mission={mission.id}", params={"field": field.name})


def fail_interrupted_missions(db: Session) -> None:
    """After a restart no flight task exists, so active missions can't be left dangling."""
    missions = db.scalars(select(m.DroneMission).where(m.DroneMission.status.in_(ACTIVE_STATUSES))).all()
    for mission in missions:
        mission.status = "failed"
        mission.completed_at = datetime.now(UTC)
        mission.drone.status = "idle"
        notify(db, mission.drone.farm.owner, "missions", "notif.mission_aborted.title",
               "notif.mission_interrupted.msg", severity="warning",
               params={"field": mission.field.name})
    if missions:
        log.warning("Marked %d interrupted simulated mission(s) as failed", len(missions))
    db.commit()
