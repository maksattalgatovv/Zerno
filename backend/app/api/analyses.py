"""Crop photo upload, analysis and the farmer's decision on recommendations."""

import io
import uuid

from fastapi import APIRouter, File, Form, UploadFile
from PIL import Image as PILImage
from PIL import UnidentifiedImageError
from sqlalchemy import select

from app import schemas
from app.adapters.storage import get_storage
from app.adapters.vision import get_vision_model
from app.api.deps import CurrentUser, Db, Lang, owned_analysis, owned_field
from app.core.config import get_settings
from app.core.errors import ApiError, not_found
from app.db import models as m
from app.services.notifications import notify
from app.services.serializers import analysis_out, image_out

router = APIRouter(tags=["analyses"])

ALLOWED_FORMATS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}


def _image_extension(data: bytes) -> str:
    """Check the real file content. The name and declared type can't be trusted."""
    try:
        with PILImage.open(io.BytesIO(data)) as image:
            image.verify()
            image_format = image.format
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise ApiError(415, "unsupported_image") from exc
    if image_format not in ALLOWED_FORMATS:
        raise ApiError(415, "unsupported_image")
    return ALLOWED_FORMATS[image_format]


@router.post("/images", response_model=schemas.ImageOut, status_code=201)
def upload_image(user: CurrentUser, db: Db, file: UploadFile = File(...), field_id: str | None = Form(None)):
    limit = get_settings().max_upload_mb
    data = file.file.read(limit * 1024 * 1024 + 1)
    if len(data) > limit * 1024 * 1024:
        raise ApiError(413, "file_too_large", limit=limit)
    extension = _image_extension(data)
    if field_id:
        owned_field(db, user, field_id)

    key = f"public/uploads/{user.id}/{uuid.uuid4().hex}.{extension}"
    get_storage().save(key, data)
    image = m.Image(user_id=user.id, field_id=field_id, image_url=key, source="upload")
    db.add(image)
    db.commit()
    return image_out(image)


@router.post("/analyses", response_model=schemas.AnalysisOut, status_code=201)
def create_analysis(body: schemas.AnalysisIn, user: CurrentUser, db: Db, lang: Lang):
    image = db.get(m.Image, body.image_id)
    if image is None or image.user_id != user.id:
        raise not_found()
    field_id = body.field_id or image.field_id
    if field_id:
        owned_field(db, user, field_id)

    model = get_vision_model()
    try:
        result = model.analyze(get_storage().read(image.image_url), body.crop_type)
    except ValueError as exc:
        raise ApiError(415, "unsupported_image") from exc

    analysis = m.AIAnalysis(
        user_id=user.id, field_id=field_id, image_id=image.id, crop_type=body.crop_type,
        model_name=model.name, is_demo=model.is_demo,
        result={
            "issue": result.issue,
            "symptoms": result.symptoms,
            "annotations": [vars(a) for a in result.annotations],
            "metrics": result.metrics,
        },
        confidence=result.confidence,
        recommendations=result.recommendations,
        needs_agronomist=result.needs_agronomist,
    )
    db.add(analysis)
    db.flush()
    notify(db, user, "ai", "notif.analysis.title", "notif.analysis.msg",
           params={"issue": f"issue.{result.issue}"}, link=f"/ai-doctor?analysis={analysis.id}")
    db.commit()
    return analysis_out(analysis, lang)


@router.get("/analyses", response_model=list[schemas.AnalysisOut])
def list_analyses(user: CurrentUser, db: Db, lang: Lang, limit: int = 30):
    analyses = db.scalars(
        select(m.AIAnalysis).where(m.AIAnalysis.user_id == user.id)
        .order_by(m.AIAnalysis.created_at.desc()).limit(min(limit, 100))
    ).all()
    return [analysis_out(a, lang) for a in analyses]


@router.get("/analyses/{analysis_id}", response_model=schemas.AnalysisOut)
def get_analysis(analysis_id: str, user: CurrentUser, db: Db, lang: Lang):
    return analysis_out(owned_analysis(db, user, analysis_id), lang)


@router.post("/analyses/{analysis_id}/actions", response_model=schemas.AnalysisOut, status_code=201)
def decide(analysis_id: str, body: schemas.ActionIn, user: CurrentUser, db: Db, lang: Lang):
    analysis = owned_analysis(db, user, analysis_id)
    if analysis.actions:
        raise ApiError(409, "already_decided")
    analysis.actions.append(m.FarmerAction(user_id=user.id, decision=body.decision, comment=body.comment))
    db.commit()
    return analysis_out(analysis, lang)
