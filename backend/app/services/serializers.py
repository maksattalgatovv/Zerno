"""Turn ORM rows into localised API models."""

from app import schemas
from app.adapters.storage import get_storage
from app.core.i18n import t
from app.db import models as m


def field_out(field: m.Field, lang: str) -> schemas.FieldOut:
    return schemas.FieldOut(
        id=field.id,
        farm_id=field.farm_id,
        name=t(field.name, lang),
        region=field.region,
        area=field.area,
        crop_type=field.crop_type,
        crop_label=t(f"crop.{field.crop_type}", lang),
        coordinates=[tuple(p) for p in field.coordinates],
        center_lat=field.center_lat,
        center_lng=field.center_lng,
        planting_date=field.planting_date,
        last_monitored_at=field.last_monitored_at,
        health_status=field.health_status,
        ndvi_mean=field.ndvi_mean,
        open_anomalies=sum(1 for a in field.anomalies if a.status == "open"),
    )


def zone_out(zone: m.Zone, lang: str) -> schemas.ZoneOut:
    return schemas.ZoneOut(
        id=zone.id,
        field_id=zone.field_id,
        name=t(zone.name, lang),
        polygon=[tuple(p) for p in zone.polygon],
        ndvi=zone.ndvi,
        health_status=zone.health_status,
        note=t(f"zone.note.{zone.health_status}", lang)
        if zone.health_status != "unknown" else "",
    )


def anomaly_out(anomaly: m.Anomaly, lang: str) -> schemas.AnomalyOut:
    zone = next((z for z in anomaly.field.zones if z.id == anomaly.zone_id), None)
    return schemas.AnomalyOut(
        id=anomaly.id,
        field_id=anomaly.field_id,
        field_name=t(anomaly.field.name, lang),
        zone_name=t(zone.name, lang) if zone else None,
        type=anomaly.type,
        title=t(f"anomaly.{anomaly.type}", lang),
        description=t(f"anomaly.{anomaly.type}.desc", lang),
        severity=anomaly.severity,
        latitude=anomaly.latitude,
        longitude=anomaly.longitude,
        area_ha=anomaly.area_ha,
        status=anomaly.status,
        detected_at=anomaly.detected_at,
        is_simulated=anomaly.is_simulated,
    )


def image_out(image: m.Image) -> schemas.ImageOut:
    return schemas.ImageOut(
        id=image.id,
        url=get_storage().url(image.image_url),
        source=image.source,
        is_simulated=image.is_simulated,
        captured_at=image.captured_at,
        gps_coordinates=tuple(image.gps_coordinates) if image.gps_coordinates else None,
        field_id=image.field_id,
        mission_id=image.mission_id,
    )


def mission_out(mission: m.DroneMission, lang: str) -> schemas.MissionOut:
    data = mission.flight_data
    position = data.get("position")
    return schemas.MissionOut(
        id=mission.id,
        purpose=data.get("purpose", "survey"),
        drone_id=mission.drone_id,
        drone_model=mission.drone.model,
        field_id=mission.field_id,
        field_name=t(mission.field.name, lang),
        status=mission.status,
        created_at=mission.created_at,
        started_at=mission.started_at,
        completed_at=mission.completed_at,
        is_simulated=data.get("simulated", True),
        phase=data.get("phase"),
        progress=data.get("progress", 0),
        battery=data.get("battery"),
        position=tuple(position) if position else None,
        route=[tuple(p) for p in data.get("route", [])],
        track=[tuple(p) for p in data.get("track", [])],
        home=tuple(data["home"]),
        altitude_m=data["altitude_m"],
        distance_m=data["distance_m"],
        duration_min=data["duration_min"],
        battery_needed=data["battery_needed"],
        battery_start=data.get("battery_start"),
        photos_taken=data.get("photos_taken", 0),
        return_reason=data.get("return_reason"),
        preflight=[
            schemas.PreflightCheck(
                code=c["code"], label=t(f"preflight.{c['code']}", lang, **c["params"]), passed=c["passed"]
            )
            for c in data.get("preflight", [])
        ],
        livestock_counts=[
            schemas.LivestockCountOut(**{**c, "group_name": t(c["group_name"], lang)})
            for c in data.get("livestock_counts", [])
        ],
    )


def mission_detail_out(mission: m.DroneMission, lang: str) -> schemas.MissionDetailOut:
    return schemas.MissionDetailOut(
        **mission_out(mission, lang).model_dump(),
        images=[image_out(i) for i in mission.images],
    )


def analysis_out(analysis: m.AIAnalysis, lang: str) -> schemas.AnalysisOut:
    result = analysis.result
    action = analysis.actions[-1] if analysis.actions else None
    return schemas.AnalysisOut(
        id=analysis.id,
        field_id=analysis.field_id,
        field_name=t(analysis.field.name, lang) if analysis.field else None,
        image=image_out(analysis.image),
        crop_type=analysis.crop_type,
        crop_label=t(f"crop.{analysis.crop_type}", lang),
        model_name=analysis.model_name,
        is_demo=analysis.is_demo,
        disclaimer=t("vision.demo_disclaimer", lang) if analysis.is_demo else None,
        issue=result["issue"],
        issue_label=t(f"issue.{result['issue']}", lang),
        symptoms=[
            schemas.SymptomOut(
                code=s["code"], label=t(f"symptom.{s['code']}", lang), coverage_pct=s["coverage_pct"]
            )
            for s in result["symptoms"]
        ],
        annotations=[schemas.AnnotationOut(**a) for a in result.get("annotations", [])],
        metrics=result.get("metrics", {}),
        confidence=analysis.confidence,
        recommendations=[t(key, lang) for key in analysis.recommendations],
        needs_agronomist=analysis.needs_agronomist,
        created_at=analysis.created_at,
        action=schemas.ActionOut.model_validate(action) if action else None,
    )
