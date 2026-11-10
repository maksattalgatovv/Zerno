"""Counting the farm's animals."""

from fastapi import APIRouter, Response

from app import schemas
from app.api.deps import CurrentUser, Db, Lang, owned_farm, owned_field
from app.core.errors import not_found
from app.db import models as m
from app.services import livestock as service

router = APIRouter(tags=["livestock"])


def _check_pasture(db: Db, user: m.User, farm_id: str, field_id: str | None) -> None:
    if field_id and owned_field(db, user, field_id).farm_id != farm_id:
        raise not_found()


def _owned(db: Db, user: m.User, group_id: str) -> m.LivestockGroup:
    group = db.get(m.LivestockGroup, group_id)
    if group is None or db.get(m.Farm, group.farm_id).owner_id != user.id:
        raise not_found()
    return group


@router.get("/farms/{farm_id}/livestock", response_model=schemas.LivestockOut)
def livestock(farm_id: str, user: CurrentUser, db: Db, lang: Lang):
    return service.summary(db, owned_farm(db, user, farm_id), lang)


@router.post("/farms/{farm_id}/livestock", response_model=schemas.LivestockGroupOut, status_code=201)
def create_group(farm_id: str, body: schemas.LivestockGroupIn, user: CurrentUser, db: Db, lang: Lang):
    farm = owned_farm(db, user, farm_id)
    _check_pasture(db, user, farm.id, body.field_id)
    return service.group_out(service.create_group(db, farm, body), lang)


@router.patch("/livestock/{group_id}", response_model=schemas.LivestockGroupOut)
def update_group(group_id: str, body: schemas.LivestockGroupUpdate, user: CurrentUser, db: Db, lang: Lang):
    group = _owned(db, user, group_id)
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if "field_id" in changes:
        changes["field_id"] = changes["field_id"] or None
        _check_pasture(db, user, group.farm_id, changes["field_id"])
    for key, value in changes.items():
        setattr(group, key, value.strip() if isinstance(value, str) and key != "field_id" else value)
    group.updated_at = m.utcnow()
    db.commit()
    return service.group_out(group, lang)


@router.delete("/livestock/{group_id}", status_code=204)
def delete_group(group_id: str, user: CurrentUser, db: Db):
    db.delete(_owned(db, user, group_id))
    db.commit()
    return Response(status_code=204)


@router.post("/livestock/{group_id}/events", response_model=schemas.LivestockEventOut, status_code=201)
def record_event(group_id: str, body: schemas.LivestockEventIn, user: CurrentUser, db: Db, lang: Lang):
    group = _owned(db, user, group_id)
    event = service.apply_event(group, body.kind, body.quantity, body.note.strip())
    db.commit()
    return service.event_out(event, lang)
