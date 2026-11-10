"""Drones and missions."""

from fastapi import APIRouter
from sqlalchemy import select

from app import schemas
from app.adapters.drone import get_drone_adapter
from app.api.deps import CurrentUser, Db, Lang, owned_drone, owned_farm, owned_field, owned_mission
from app.core.errors import ApiError
from app.db import models as m
from app.services import missions as service
from app.services.mission_runner import runner
from app.services.serializers import mission_detail_out, mission_out

router = APIRouter(tags=["drones"])


def _drone_out(drone: m.Drone) -> schemas.DroneOut:
    adapter = get_drone_adapter(drone.adapter)
    return schemas.DroneOut(
        id=drone.id, farm_id=drone.farm_id, model=drone.model, serial=drone.serial,
        adapter=drone.adapter, is_simulated=bool(adapter and adapter.is_simulated),
        status=drone.status, battery_level=drone.battery_level, gps_status=drone.gps_status,
        connection_status=drone.connection_status, home_lat=drone.home_lat, home_lng=drone.home_lng,
        last_mission=drone.last_mission, last_mission_at=drone.last_mission_at,
    )


@router.get("/farms/{farm_id}/drones", response_model=list[schemas.DroneOut])
def list_drones(farm_id: str, user: CurrentUser, db: Db):
    farm = owned_farm(db, user, farm_id)
    return [_drone_out(d) for d in sorted(farm.drones, key=lambda d: d.model)]


@router.post("/drones/{drone_id}/charge", response_model=schemas.DroneOut)
def charge_drone(drone_id: str, user: CurrentUser, db: Db):
    drone = owned_drone(db, user, drone_id)
    if drone.status == "in_mission":
        raise ApiError(409, "drone_busy")
    if drone.status == "idle" and drone.battery_level < 100:
        drone.status = "charging"
        db.commit()
        runner.charge(drone.id)
    return _drone_out(drone)


@router.get("/farms/{farm_id}/missions", response_model=list[schemas.MissionOut])
def list_missions(farm_id: str, user: CurrentUser, db: Db, lang: Lang, limit: int = 30):
    farm = owned_farm(db, user, farm_id)
    missions = db.scalars(
        select(m.DroneMission).join(m.Drone).where(m.Drone.farm_id == farm.id)
        .order_by(m.DroneMission.created_at.desc()).limit(min(limit, 100))
    ).all()
    return [mission_out(x, lang) for x in missions]


@router.post("/missions", response_model=schemas.MissionOut, status_code=201)
def plan_mission(body: schemas.MissionPlanIn, user: CurrentUser, db: Db, lang: Lang):
    drone = owned_drone(db, user, body.drone_id)
    field = owned_field(db, user, body.field_id)
    if drone.farm_id != field.farm_id:
        raise ApiError(404, "not_found")
    return mission_out(service.plan_mission(db, drone, field, body.altitude_m, body.purpose), lang)


@router.get("/missions/{mission_id}", response_model=schemas.MissionDetailOut)
def get_mission(mission_id: str, user: CurrentUser, db: Db, lang: Lang):
    return mission_detail_out(owned_mission(db, user, mission_id), lang)


@router.post("/missions/{mission_id}/start", response_model=schemas.MissionOut)
def start_mission(mission_id: str, body: schemas.MissionStartIn, user: CurrentUser, db: Db, lang: Lang):
    mission = owned_mission(db, user, mission_id)
    service.authorize_start(db, mission, body.operator_confirmed)
    # Claimed now so a second click can't launch the same mission twice.
    mission.status = "in_progress"
    mission.drone.status = "in_mission"
    db.commit()
    runner.launch(mission.id)
    return mission_out(mission, lang)


@router.post("/missions/{mission_id}/return-home", response_model=schemas.MissionOut)
def return_home(mission_id: str, user: CurrentUser, db: Db, lang: Lang):
    mission = owned_mission(db, user, mission_id)
    if mission.status != "in_progress" or not runner.request_return(mission.id):
        raise ApiError(409, "mission_state")
    return mission_out(mission, lang)


@router.post("/missions/{mission_id}/cancel", response_model=schemas.MissionOut)
def cancel_mission(mission_id: str, user: CurrentUser, db: Db, lang: Lang):
    mission = owned_mission(db, user, mission_id)
    if mission.status != "planned":
        raise ApiError(409, "mission_state")
    mission.status = "cancelled"
    db.commit()
    return mission_out(mission, lang)
