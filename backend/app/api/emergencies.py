"""Raising, following and closing emergencies."""

from fastapi import APIRouter
from sqlalchemy import select

from app import schemas
from app.api.deps import CurrentUser, Db, Lang, owned_farm, owned_field
from app.core.errors import ApiError, not_found
from app.core.i18n import t
from app.db import models as m
from app.services import emergencies as service

router = APIRouter(tags=["emergencies"])

RECENT_LIMIT = 10


def _out(emergency: m.Emergency, lang: str) -> schemas.EmergencyOut:
    return schemas.EmergencyOut(
        id=emergency.id, farm_id=emergency.farm_id, field_id=emergency.field_id,
        field_name=service.field_label(emergency, lang), type=emergency.type,
        title=t(f"emergency.type.{emergency.type}", lang), status=emergency.status,
        latitude=emergency.latitude, longitude=emergency.longitude,
        mission_id=emergency.mission_id, created_at=emergency.created_at,
        resolved_at=emergency.resolved_at, log=service.localized_log(emergency, lang),
    )


def _owned(db: Db, user: m.User, emergency_id: str) -> m.Emergency:
    emergency = db.get(m.Emergency, emergency_id)
    if emergency is None or emergency.user_id != user.id:
        raise not_found()
    return emergency


@router.get("/farms/{farm_id}/emergencies", response_model=list[schemas.EmergencyOut])
def list_emergencies(farm_id: str, user: CurrentUser, db: Db, lang: Lang):
    farm = owned_farm(db, user, farm_id)
    rows = db.scalars(
        select(m.Emergency).where(m.Emergency.farm_id == farm.id)
        .order_by(m.Emergency.created_at.desc()).limit(RECENT_LIMIT)
    ).all()
    return [_out(e, lang) for e in rows]


@router.post("/emergencies", response_model=schemas.EmergencyOut, status_code=201)
def raise_emergency(body: schemas.EmergencyIn, user: CurrentUser, db: Db, lang: Lang):
    farm = owned_farm(db, user, body.farm_id)
    field = owned_field(db, user, body.field_id) if body.field_id else None
    if field and field.farm_id != farm.id:
        raise not_found()
    return _out(service.raise_emergency(db, user, farm, field, body.type, body.send_drone), lang)


@router.post("/emergencies/{emergency_id}/drone", response_model=schemas.EmergencyOut)
def send_drone(emergency_id: str, body: schemas.EmergencyDroneIn, user: CurrentUser, db: Db, lang: Lang):
    emergency = _owned(db, user, emergency_id)
    service.dispatch_drone(db, emergency, body.mode)
    return _out(emergency, lang)


@router.post("/emergencies/{emergency_id}/events", response_model=schemas.EmergencyOut)
def record_event(emergency_id: str, body: schemas.EmergencyEventIn, user: CurrentUser, db: Db, lang: Lang):
    """Actions that happen on the user's device, kept in the incident's timeline."""
    emergency = _owned(db, user, emergency_id)
    if emergency.status != "active":
        raise ApiError(409, "emergency_closed")
    emergency.add_log(body.code, detail=body.detail)
    db.commit()
    return _out(emergency, lang)


@router.post("/emergencies/{emergency_id}/resolve", response_model=schemas.EmergencyOut)
def resolve(emergency_id: str, user: CurrentUser, db: Db, lang: Lang):
    emergency = _owned(db, user, emergency_id)
    service.resolve_emergency(db, emergency)
    return _out(emergency, lang)
