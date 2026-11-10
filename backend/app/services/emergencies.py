"""Emergency handling.

What runs here is deliberately modest about its reach: ZERNO records the incident, warns
inside the app and can send a drone. It can't contact emergency services, so the interface
always asks a person to call them. Drones still pass the same safety gate as any flight.
"""

import logging
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.adapters.drone import get_drone_adapter
from app.core.errors import ApiError
from app.core.i18n import t, t_params
from app.db import models as m
from app.domain.flight import estimate_orbit
from app.services.mission_runner import runner
from app.services.missions import _preflight, authorize_start

log = logging.getLogger("zerno.emergency")

FIRE_ANOMALY_HA = 1.0
DRONE_ALTITUDE_M = 60


def raise_emergency(db: Session, user: m.User, farm: m.Farm, field: m.Field | None,
                    kind: str, send_drone: bool) -> m.Emergency:
    """Everything that happens the moment the alarm is raised.

    The record is committed first: a drone problem must never lose the incident.
    """
    latitude = field.center_lat if field else farm.latitude
    longitude = field.center_lng if field else farm.longitude
    emergency = m.Emergency(user_id=user.id, farm=farm, field=field, type=kind,
                            latitude=latitude, longitude=longitude)
    db.add(emergency)
    emergency.add_log("created", type=f"emergency.type.{kind}")

    if kind == "fire" and field:
        anomaly = m.Anomaly(field=field, type="fire", severity="critical", latitude=latitude,
                            longitude=longitude, area_ha=FIRE_ANOMALY_HA, is_simulated=False)
        db.add(anomaly)
        db.flush()
        emergency.anomaly_id = anomaly.id
        emergency.add_log("mapped")

    # Bypasses notification preferences on purpose: an alarm can't be switched off.
    db.add(m.Notification(
        user_id=user.id, title="notif.emergency.title", message="notif.emergency.msg",
        params={"type": f"emergency.type.{kind}", "place": field.name if field else "emergency.place.unknown"},
        severity="critical", link="/emergency",
    ))
    emergency.add_log("notified")
    db.commit()
    log.warning("Emergency %s raised on farm %s", kind, farm.id)

    if send_drone:
        dispatch_drone(db, emergency, "recon")
    return emergency


def _ready_drone(farm: m.Farm, target: tuple[float, float]) -> m.Drone | None:
    """The fullest drone that passes every pre-flight check for this trip."""
    for drone in sorted(farm.drones, key=lambda d: d.battery_level, reverse=True):
        adapter = get_drone_adapter(drone.adapter)
        if adapter is None or not adapter.available:
            continue
        estimate = estimate_orbit(target, (drone.home_lat, drone.home_lng), DRONE_ALTITUDE_M)
        if all(c["passed"] for c in _preflight(drone, estimate.battery_needed, DRONE_ALTITUDE_M)):
            return drone
    return None


def dispatch_drone(db: Session, emergency: m.Emergency, mode: str) -> m.DroneMission | None:
    """Send a drone to the incident. Failure is logged, not raised: the alarm stands."""
    if emergency.status != "active":
        raise ApiError(409, "emergency_closed")
    field = emergency.field
    if field is None:
        emergency.add_log("no_field")
        db.commit()
        return None

    target = (emergency.latitude, emergency.longitude)
    drone = _ready_drone(emergency.farm, target)
    if drone is None:
        emergency.add_log("no_drone")
        db.commit()
        return None

    home = (drone.home_lat, drone.home_lng)
    estimate = estimate_orbit(target, home, DRONE_ALTITUDE_M)
    adapter = get_drone_adapter(drone.adapter)
    mission = m.DroneMission(
        drone=drone, field=field, status="planned",
        flight_data={
            "simulated": adapter.is_simulated,
            "emergency_id": emergency.id,
            "emergency_mode": mode,
            "route": [list(p) for p in estimate.route],
            "home": list(home),
            "altitude_m": DRONE_ALTITUDE_M,
            "distance_m": estimate.distance_m,
            "duration_min": estimate.duration_min,
            "battery_needed": estimate.battery_needed,
            "preflight": _preflight(drone, estimate.battery_needed, DRONE_ALTITUDE_M),
            "track": [],
            "progress": 0,
            "photos_taken": 0,
        },
    )
    db.add(mission)
    db.flush()
    # Raising the alarm, or pressing the drone button, is the operator's confirmation.
    authorize_start(db, mission, operator_confirmed=True)
    mission.status = "in_progress"
    drone.status = "in_mission"
    emergency.mission_id = mission.id
    emergency.add_log(f"drone_{mode}", drone=drone.model)
    db.commit()
    runner.launch(mission.id)
    return mission


def resolve_emergency(db: Session, emergency: m.Emergency) -> None:
    if emergency.status != "active":
        raise ApiError(409, "emergency_closed")
    emergency.status = "resolved"
    emergency.resolved_at = datetime.now(UTC)
    emergency.add_log("resolved")
    if emergency.anomaly_id:
        anomaly = db.get(m.Anomaly, emergency.anomaly_id)
        if anomaly:
            anomaly.status = "resolved"
    db.commit()


def localized_log(emergency: m.Emergency, lang: str) -> list[dict]:
    return [
        {"code": entry["code"], "at": entry["at"],
         "text": t_params(f"emergency.log.{entry['code']}", lang, entry.get("params"))}
        for entry in emergency.log
    ]


def field_label(emergency: m.Emergency, lang: str) -> str | None:
    return t(emergency.field.name, lang) if emergency.field else None
