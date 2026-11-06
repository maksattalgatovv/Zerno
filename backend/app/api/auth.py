"""Registration, sign-in, demo access, password reset and the user profile."""

import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter
from sqlalchemy import func, select

from app import schemas
from app.api.deps import CurrentUser, Db
from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.security import create_access_token, hash_password, verify_password
from app.db import models as m
from app.seed import DEMO_EMAIL

log = logging.getLogger("zerno.auth")
router = APIRouter(tags=["auth"])

RESET_TOKEN_TTL = timedelta(hours=1)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _find_by_email(db: Db, email: str) -> m.User | None:
    return db.scalar(select(m.User).where(func.lower(m.User.email) == email.lower()))


@router.post("/auth/register", response_model=schemas.TokenOut, status_code=201)
def register(body: schemas.RegisterIn, db: Db):
    if _find_by_email(db, body.email):
        raise ApiError(409, "email_taken")
    user = m.User(name=body.name, email=body.email.lower(), language=body.language,
                  password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    return schemas.TokenOut(access_token=create_access_token(user.id))


@router.post("/auth/login", response_model=schemas.TokenOut)
def login(body: schemas.LoginIn, db: Db):
    user = _find_by_email(db, body.email)
    if user is None or not verify_password(body.password, user.password_hash):
        raise ApiError(401, "invalid_credentials")
    return schemas.TokenOut(access_token=create_access_token(user.id))


@router.post("/auth/demo", response_model=schemas.TokenOut)
def demo_login(db: Db):
    if not get_settings().demo_mode:
        raise ApiError(403, "demo_disabled")
    user = db.scalar(select(m.User).where(m.User.email == DEMO_EMAIL))
    if user is None:
        raise ApiError(503, "demo_not_seeded")
    return schemas.TokenOut(access_token=create_access_token(user.id))


@router.post("/auth/forgot-password", response_model=schemas.ForgotPasswordOut)
def forgot_password(body: schemas.ForgotPasswordIn, db: Db):
    """Always answers the same, so the endpoint doesn't reveal which emails have accounts."""
    user = _find_by_email(db, body.email)
    if user is None or user.is_demo:
        return schemas.ForgotPasswordOut()

    token = secrets.token_urlsafe(32)
    db.add(m.PasswordResetToken(user_id=user.id, token_hash=_token_hash(token),
                                expires_at=datetime.now(UTC) + RESET_TOKEN_TTL))
    db.commit()
    if get_settings().expose_reset_tokens:
        return schemas.ForgotPasswordOut(dev_reset_token=token)
    log.info("Password reset requested for user %s; no email provider is configured", user.id)
    return schemas.ForgotPasswordOut()


@router.post("/auth/reset-password", status_code=204)
def reset_password(body: schemas.ResetPasswordIn, db: Db):
    record = db.scalar(select(m.PasswordResetToken).where(
        m.PasswordResetToken.token_hash == _token_hash(body.token)
    ))
    if record is None or record.used_at or record.expires_at < datetime.now(UTC):
        raise ApiError(400, "reset_invalid")
    user = db.get(m.User, record.user_id)
    user.password_hash = hash_password(body.password)
    record.used_at = datetime.now(UTC)
    db.commit()


@router.get("/users/me", response_model=schemas.UserOut)
def me(user: CurrentUser):
    return user


@router.patch("/users/me", response_model=schemas.UserOut)
def update_me(body: schemas.UserUpdate, user: CurrentUser, db: Db):
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    db.commit()
    return user


@router.post("/users/me/password", status_code=204)
def change_password(body: schemas.PasswordChange, user: CurrentUser, db: Db):
    if user.is_demo:
        raise ApiError(403, "demo_locked")
    if not verify_password(body.current_password, user.password_hash):
        raise ApiError(400, "wrong_password")
    user.password_hash = hash_password(body.new_password)
    db.commit()
