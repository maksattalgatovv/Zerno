"""Shared request dependencies. Every lookup enforces ownership by the signed-in user."""

from typing import Annotated

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError, not_found
from app.core.i18n import resolve_lang
from app.core.security import decode_access_token
from app.db import models as m
from app.db.session import get_db

bearer = HTTPBearer(auto_error=False)

Db = Annotated[Session, Depends(get_db)]


def get_lang(accept_language: Annotated[str | None, Header()] = None) -> str:
    return resolve_lang(accept_language)


Lang = Annotated[str, Depends(get_lang)]


def get_current_user(
    db: Db, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
) -> m.User:
    user_id = decode_access_token(credentials.credentials) if credentials else None
    user = db.get(m.User, user_id) if user_id else None
    if user is None:
        raise ApiError(401, "unauthorized")
    return user


CurrentUser = Annotated[m.User, Depends(get_current_user)]


def owned_farm(db: Session, user: m.User, farm_id: str) -> m.Farm:
    farm = db.get(m.Farm, farm_id)
    if farm is None or farm.owner_id != user.id:
        raise not_found()
    return farm


def owned_field(db: Session, user: m.User, field_id: str) -> m.Field:
    field = db.get(m.Field, field_id)
    if field is None or field.farm.owner_id != user.id:
        raise not_found()
    return field


def owned_drone(db: Session, user: m.User, drone_id: str) -> m.Drone:
    drone = db.get(m.Drone, drone_id)
    if drone is None or drone.farm.owner_id != user.id:
        raise not_found()
    return drone


def owned_mission(db: Session, user: m.User, mission_id: str) -> m.DroneMission:
    mission = db.get(m.DroneMission, mission_id)
    if mission is None or mission.drone.farm.owner_id != user.id:
        raise not_found()
    return mission


def owned_analysis(db: Session, user: m.User, analysis_id: str) -> m.AIAnalysis:
    analysis = db.scalar(select(m.AIAnalysis).where(
        m.AIAnalysis.id == analysis_id, m.AIAnalysis.user_id == user.id
    ))
    if analysis is None:
        raise not_found()
    return analysis
