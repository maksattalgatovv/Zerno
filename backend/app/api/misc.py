"""Notifications, assistant, reports and system endpoints."""

import logging
import uuid

from fastapi import APIRouter
from fastapi.responses import Response
from sqlalchemy import delete, select, text, update

from app import schemas
from app.adapters.llm import get_assistant
from app.adapters.llm.demo import TEXT, DemoAssistant
from app.adapters.storage import LocalStorage, get_storage
from app.adapters.vision import get_vision_model
from app.adapters.weather import get_weather
from app.api.deps import (
    CurrentUser, Db, Lang, owned_analysis, owned_farm, owned_field, owned_mission,
)
from app.core.config import get_settings
from app.core.errors import ApiError, not_found
from app.core.i18n import t, t_params
from app.db import models as m
from app.db.session import SessionLocal
from app.seed import seed_demo
from app.services import analytics, reports
from app.services.mission_runner import runner

log = logging.getLogger("zerno.api")
router = APIRouter()

HISTORY_LIMIT = 20
APP_VERSION = "0.1.0"


# --- Notifications ---
def _notification_out(n: m.Notification, lang: str) -> schemas.NotificationOut:
    return schemas.NotificationOut(
        id=n.id, title=t(n.title, lang), message=t_params(n.message, lang, n.params),
        severity=n.severity, link=n.link, read=n.read, created_at=n.created_at,
    )


@router.get("/notifications", response_model=list[schemas.NotificationOut], tags=["notifications"])
def list_notifications(user: CurrentUser, db: Db, lang: Lang):
    rows = db.scalars(
        select(m.Notification).where(m.Notification.user_id == user.id)
        .order_by(m.Notification.created_at.desc()).limit(30)
    ).all()
    return [_notification_out(n, lang) for n in rows]


@router.post("/notifications/read-all", status_code=204, tags=["notifications"])
def read_all(user: CurrentUser, db: Db):
    db.execute(update(m.Notification).where(m.Notification.user_id == user.id).values(read=True))
    db.commit()


@router.post("/notifications/{notification_id}/read", status_code=204, tags=["notifications"])
def read_one(notification_id: str, user: CurrentUser, db: Db):
    row = db.get(m.Notification, notification_id)
    if row is None or row.user_id != user.id:
        raise not_found()
    row.read = True
    db.commit()


# --- Assistant ---
def _chat_out(row: m.ChatMessage) -> schemas.ChatMessageOut:
    return schemas.ChatMessageOut(
        id=row.id, role=row.role, content=row.content, provider=row.provider,
        is_demo=row.provider.startswith("demo"), created_at=row.created_at,
    )


def _history(db: Db, user: m.User, farm_id: str) -> list[m.ChatMessage]:
    rows = db.scalars(
        select(m.ChatMessage).where(m.ChatMessage.user_id == user.id, m.ChatMessage.farm_id == farm_id)
        .order_by(m.ChatMessage.created_at.desc()).limit(HISTORY_LIMIT)
    ).all()
    return list(reversed(rows))


@router.get("/assistant/info", response_model=schemas.AssistantInfo, tags=["assistant"])
def assistant_info(user: CurrentUser, lang: Lang):
    provider = get_assistant()
    return schemas.AssistantInfo(
        provider=provider.provider_id, is_demo=provider.is_demo,
        notice=TEXT[lang]["notice"] if provider.is_demo else None,
    )


@router.get("/assistant/messages", response_model=list[schemas.ChatMessageOut], tags=["assistant"])
def assistant_messages(farm_id: str, user: CurrentUser, db: Db):
    owned_farm(db, user, farm_id)
    return [_chat_out(r) for r in _history(db, user, farm_id)]


@router.post("/assistant/messages", response_model=schemas.ChatMessageOut, status_code=201, tags=["assistant"])
def ask_assistant(body: schemas.ChatIn, user: CurrentUser, db: Db, lang: Lang):
    farm = owned_farm(db, user, body.farm_id)
    history = [{"role": r.role, "content": r.content} for r in _history(db, user, farm.id)]
    context = analytics.assistant_context(db, farm, lang)

    db.add(m.ChatMessage(user_id=user.id, farm_id=farm.id, role="user", content=body.content))
    db.flush()

    provider = get_assistant()
    try:
        answer = provider.reply(context, history, body.content, lang)
    except Exception:
        # The farmer still gets a truthful answer, and it is labelled as the demo.
        log.exception("Assistant provider %s failed; using demo answers", provider.provider_id)
        provider = DemoAssistant()
        answer = provider.reply(context, history, body.content, lang)

    reply = m.ChatMessage(user_id=user.id, farm_id=farm.id, role="assistant", content=answer,
                          provider=provider.provider_id)
    db.add(reply)
    db.commit()
    return _chat_out(reply)


@router.delete("/assistant/messages", status_code=204, tags=["assistant"])
def clear_assistant(farm_id: str, user: CurrentUser, db: Db):
    owned_farm(db, user, farm_id)
    db.execute(delete(m.ChatMessage).where(m.ChatMessage.user_id == user.id, m.ChatMessage.farm_id == farm_id))
    db.commit()


# --- Reports ---
def _build_story(db: Db, user: m.User, body: schemas.ReportIn, farm: m.Farm, lang: str) -> tuple[list, str]:
    base = t(f"report.type.{body.type}", lang)
    if body.type == "crop_health":
        return reports.crop_health_report(farm, lang, base), f"{base}: {farm.name}"
    if body.type == "field_monitoring" and body.field_id:
        field = owned_field(db, user, body.field_id)
        title = f"{base}: {t(field.name, lang)}"
        return reports.field_report(farm, field, lang, title), title
    if body.type == "drone_mission" and body.mission_id:
        mission = owned_mission(db, user, body.mission_id)
        title = f"{base}: {t(mission.field.name, lang)}"
        return reports.mission_report(farm, mission, lang, title), title
    if body.type == "ai_analysis" and body.analysis_id:
        analysis = owned_analysis(db, user, body.analysis_id)
        return reports.analysis_report(farm, analysis, lang, base), base
    raise ApiError(400, "bad_report_target")


@router.get("/farms/{farm_id}/reports", response_model=list[schemas.ReportOut], tags=["reports"])
def list_reports(farm_id: str, user: CurrentUser, db: Db):
    farm = owned_farm(db, user, farm_id)
    return db.scalars(
        select(m.Report).where(m.Report.farm_id == farm.id).order_by(m.Report.created_at.desc())
    ).all()


@router.post("/reports", response_model=schemas.ReportOut, status_code=201, tags=["reports"])
def create_report(body: schemas.ReportIn, user: CurrentUser, db: Db, lang: Lang):
    farm = owned_farm(db, user, body.farm_id)
    story, title = _build_story(db, user, body, farm, lang)
    pdf = reports.build_pdf(story, title)
    key = f"private/reports/{user.id}/{uuid.uuid4().hex}.pdf"
    get_storage().save(key, pdf)
    report = m.Report(user_id=user.id, farm_id=farm.id, type=body.type, title=title, language=lang,
                      storage_key=key, size_bytes=len(pdf))
    db.add(report)
    db.commit()
    return report


def _owned_report(db: Db, user: m.User, report_id: str) -> m.Report:
    report = db.get(m.Report, report_id)
    if report is None or report.user_id != user.id:
        raise not_found()
    return report


@router.get("/reports/{report_id}/download", tags=["reports"], response_class=Response)
def download_report(report_id: str, user: CurrentUser, db: Db):
    report = _owned_report(db, user, report_id)
    return Response(
        get_storage().read(report.storage_key), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="zerno-report-{report.id[:8]}.pdf"'},
    )


@router.delete("/reports/{report_id}", status_code=204, tags=["reports"])
def delete_report(report_id: str, user: CurrentUser, db: Db):
    report = _owned_report(db, user, report_id)
    get_storage().delete(report.storage_key)
    db.delete(report)
    db.commit()


# --- System ---
@router.get("/health", tags=["system"])
def health():
    return {"status": "ok"}


@router.get("/system/status", response_model=schemas.SystemStatusOut, tags=["system"])
def system_status(user: CurrentUser, db: Db):
    try:
        db.execute(text("SELECT 1"))
        database = schemas.ServiceStatus(key="database", status="ok", detail="PostgreSQL")
    except Exception:
        log.exception("Database health check failed")
        database = schemas.ServiceStatus(key="database", status="error", detail="PostgreSQL")

    storage = get_storage()
    vision = get_vision_model()
    assistant = get_assistant()
    return schemas.SystemStatusOut(
        version=APP_VERSION,
        demo_mode=get_settings().demo_mode,
        services=[
            database,
            schemas.ServiceStatus(key="storage", status="ok",
                                  detail="local" if isinstance(storage, LocalStorage) else "s3"),
            schemas.ServiceStatus(key="drone", status="demo", detail="simulated"),
            schemas.ServiceStatus(key="vision", status="demo" if vision.is_demo else "ok", detail=vision.name),
            schemas.ServiceStatus(key="assistant", status="demo" if assistant.is_demo else "ok",
                                  detail=assistant.provider_id),
            schemas.ServiceStatus(key="weather", status="demo" if get_weather().is_demo else "ok",
                                  detail="demo"),
        ],
    )


@router.post("/system/demo-reset", status_code=204, tags=["system"])
def demo_reset(user: CurrentUser):
    if not get_settings().demo_mode:
        raise ApiError(403, "demo_disabled")
    if not user.is_demo:
        raise ApiError(403, "demo_only")
    # Separate session: the request's session still holds the user row being replaced.
    with SessionLocal() as db:
        seed_demo(db)
    log.info("Demo data reset; %d flight task(s) will stop on their next tick", len(runner._tasks))
