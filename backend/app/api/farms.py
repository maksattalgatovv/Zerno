"""Farms, fields, zones, anomalies and the read models built on them."""

from datetime import UTC, datetime

from fastapi import APIRouter
from sqlalchemy import select

from app import schemas
from app.api.deps import CurrentUser, Db, Lang, owned_farm, owned_field
from app.core.errors import not_found
from app.core.i18n import t
from app.db import models as m
from app.domain.geo import centroid, polygon_area_ha, rectangle_for_area
from app.services import analytics
from app.services.serializers import analysis_out, anomaly_out, field_out, mission_out, zone_out

router = APIRouter(tags=["farms"])

DEFAULT_DRONE_MODEL = "Scout S1 (simulated)"


def _farm_out(farm: m.Farm) -> schemas.FarmOut:
    return schemas.FarmOut(
        id=farm.id, name=farm.name, region=farm.region, location=farm.location,
        latitude=farm.latitude, longitude=farm.longitude, main_crop=farm.main_crop,
        field_count=len(farm.fields), total_area=round(sum(f.area for f in farm.fields), 1),
    )


@router.get("/farms", response_model=list[schemas.FarmOut])
def list_farms(user: CurrentUser, db: Db):
    farms = db.scalars(select(m.Farm).where(m.Farm.owner_id == user.id).order_by(m.Farm.created_at))
    return [_farm_out(f) for f in farms]


@router.post("/farms", response_model=schemas.FarmOut, status_code=201)
def create_farm(body: schemas.FarmIn, user: CurrentUser, db: Db):
    farm = m.Farm(owner_id=user.id, **body.model_dump())
    # Every farm starts with a simulated drone so missions can be tried immediately.
    farm.drones.append(m.Drone(model=DEFAULT_DRONE_MODEL, serial="SIM-NEW", adapter="simulated",
                               home_lat=body.latitude, home_lng=body.longitude))
    db.add(farm)
    db.commit()
    return _farm_out(farm)


@router.put("/farms/{farm_id}", response_model=schemas.FarmOut)
def update_farm(farm_id: str, body: schemas.FarmIn, user: CurrentUser, db: Db):
    farm = owned_farm(db, user, farm_id)
    for key, value in body.model_dump().items():
        setattr(farm, key, value)
    db.commit()
    return _farm_out(farm)


@router.delete("/farms/{farm_id}", status_code=204)
def delete_farm(farm_id: str, user: CurrentUser, db: Db):
    db.delete(owned_farm(db, user, farm_id))
    db.commit()


@router.get("/farms/{farm_id}/dashboard", response_model=schemas.DashboardOut)
def dashboard(farm_id: str, user: CurrentUser, db: Db, lang: Lang):
    return analytics.dashboard(db, owned_farm(db, user, farm_id), user, lang)


@router.get("/farms/{farm_id}/map", response_model=schemas.MapOut)
def farm_map(farm_id: str, user: CurrentUser, db: Db, lang: Lang):
    return analytics.map_view(owned_farm(db, user, farm_id), lang)


@router.get("/farms/{farm_id}/analytics", response_model=schemas.AnalyticsOut)
def farm_analytics(farm_id: str, user: CurrentUser, db: Db, lang: Lang):
    return analytics.analytics(owned_farm(db, user, farm_id), lang)


@router.get("/farms/{farm_id}/fields", response_model=list[schemas.FieldOut])
def list_fields(farm_id: str, user: CurrentUser, db: Db, lang: Lang):
    farm = owned_farm(db, user, farm_id)
    return [field_out(f, lang) for f in sorted(farm.fields, key=lambda f: f.created_at)]


def _apply_field(field: m.Field, body: schemas.FieldIn) -> None:
    field.name = body.name
    field.region = body.region
    field.crop_type = body.crop_type
    field.planting_date = body.planting_date
    field.area = body.area
    center = (body.latitude, body.longitude)
    polygon = [tuple(p) for p in body.coordinates] if body.coordinates else None
    if polygon:
        center = centroid(polygon)
    moved = (field.center_lat, field.center_lng) != center
    resized = not field.coordinates or abs(polygon_area_ha(field.coordinates) - body.area) > 0.01 * body.area
    if polygon or moved or resized:
        field.coordinates = [list(p) for p in polygon or rectangle_for_area(center, body.area)]
        field.center_lat, field.center_lng = center
        # Zones belong to the old shape.
        field.zones.clear()


@router.post("/farms/{farm_id}/fields", response_model=schemas.FieldOut, status_code=201)
def create_field(farm_id: str, body: schemas.FieldIn, user: CurrentUser, db: Db, lang: Lang):
    farm = owned_farm(db, user, farm_id)
    field = m.Field(farm_id=farm.id, coordinates=[], center_lat=0, center_lng=0)
    _apply_field(field, body)
    db.add(field)
    db.commit()
    return field_out(field, lang)


@router.get("/fields/{field_id}", response_model=schemas.FieldDetailOut)
def get_field(field_id: str, user: CurrentUser, db: Db, lang: Lang):
    field = owned_field(db, user, field_id)
    missions = db.scalars(
        select(m.DroneMission).where(m.DroneMission.field_id == field.id)
        .order_by(m.DroneMission.created_at.desc()).limit(10)
    ).all()
    analyses = db.scalars(
        select(m.AIAnalysis).where(m.AIAnalysis.field_id == field.id)
        .order_by(m.AIAnalysis.created_at.desc()).limit(10)
    ).all()
    return schemas.FieldDetailOut(
        **field_out(field, lang).model_dump(),
        zones=[zone_out(z, lang) for z in field.zones],
        anomalies=[anomaly_out(a, lang) for a in sorted(field.anomalies, key=lambda a: a.detected_at, reverse=True)],
        history=[schemas.NdviPoint.model_validate(r) for r in field.ndvi_records],
        missions=[mission_out(x, lang) for x in missions],
        analyses=[analysis_out(a, lang) for a in analyses],
    )


@router.put("/fields/{field_id}", response_model=schemas.FieldOut)
def update_field(field_id: str, body: schemas.FieldIn, user: CurrentUser, db: Db, lang: Lang):
    field = owned_field(db, user, field_id)
    # Seeded names are translation keys: keep the key if the visible name wasn't edited.
    if body.name == t(field.name, lang):
        body = body.model_copy(update={"name": field.name})
    _apply_field(field, body)
    db.commit()
    return field_out(field, lang)


@router.delete("/fields/{field_id}", status_code=204)
def delete_field(field_id: str, user: CurrentUser, db: Db):
    db.delete(owned_field(db, user, field_id))
    db.commit()


@router.get("/fields/{field_id}/ndvi", response_model=schemas.NdviGridOut)
def field_ndvi(field_id: str, user: CurrentUser, db: Db, lang: Lang):
    return analytics.ndvi_grid(owned_field(db, user, field_id), lang)


@router.patch("/anomalies/{anomaly_id}", response_model=schemas.AnomalyOut)
def update_anomaly(anomaly_id: str, body: schemas.AnomalyUpdate, user: CurrentUser, db: Db, lang: Lang):
    anomaly = db.get(m.Anomaly, anomaly_id)
    if anomaly is None or anomaly.field.farm.owner_id != user.id:
        raise not_found()
    anomaly.status = body.status
    db.commit()
    return anomaly_out(anomaly, lang)
