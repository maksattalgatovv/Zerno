"""Read models for the dashboard, analytics page and map."""

from collections import Counter, defaultdict
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.adapters.weather import get_weather
from app.core.i18n import t
from app.db import models as m
from app.domain.geo import METERS_PER_DEG_LAT
from app.services.sample_data import sample_ndvi_grid
from app.domain.ndvi import summarize_ndvi
from app.services.serializers import anomaly_out, field_out, mission_out, zone_out
import numpy as np

HEALTH_ORDER = ("healthy", "attention", "critical", "unknown")
MAX_ALERTS = 5
MAX_ACTIVITY = 8
BOUNDARY_PAD_M = 80


def farm_stats(farm: m.Farm) -> schemas.StatsOut:
    fields = farm.fields
    observed = [(f.ndvi_mean, f.area) for f in fields if f.ndvi_mean is not None]
    area = sum(a for _, a in observed)
    return schemas.StatsOut(
        total_area=round(sum(f.area for f in fields), 1),
        field_count=len(fields),
        avg_ndvi=round(sum(n * a for n, a in observed) / area, 2) if area else None,
        open_anomalies=sum(1 for f in fields for a in f.anomalies if a.status == "open"),
        livestock_total=sum(g.head_count for g in farm.livestock_groups),
    )


def health_slices(farm: m.Farm, lang: str) -> list[schemas.HealthSlice]:
    return [
        schemas.HealthSlice(
            status=status,
            label=t(f"health.{status}", lang),
            area=round(sum(f.area for f in farm.fields if f.health_status == status), 1),
            fields=sum(1 for f in farm.fields if f.health_status == status),
        )
        for status in HEALTH_ORDER
    ]


def latest_mission(db: Session, farm: m.Farm) -> m.DroneMission | None:
    return db.scalar(
        select(m.DroneMission).join(m.Drone).where(m.Drone.farm_id == farm.id)
        .order_by(m.DroneMission.created_at.desc()).limit(1)
    )


def _alerts(farm: m.Farm, lang: str) -> list[schemas.AlertOut]:
    anomalies = [a for f in farm.fields for a in f.anomalies if a.status == "open"]
    anomalies.sort(key=lambda a: (a.severity != "critical", -a.detected_at.timestamp()))
    return [
        schemas.AlertOut(
            id=a.id,
            title=t(f"anomaly.{a.type}", lang),
            message=t(a.field.name, lang),
            severity=a.severity,
            link=f"/map?anomaly={a.id}",
            created_at=a.detected_at,
        )
        for a in anomalies[:MAX_ALERTS]
    ]


def _activity(db: Session, farm: m.Farm, user: m.User, lang: str) -> list[schemas.ActivityOut]:
    items: list[schemas.ActivityOut] = []
    missions = db.scalars(
        select(m.DroneMission).join(m.Drone).where(m.Drone.farm_id == farm.id)
        .order_by(m.DroneMission.created_at.desc()).limit(MAX_ACTIVITY)
    ).all()
    for mission in missions:
        items.append(schemas.ActivityOut(
            id=f"mission-{mission.id}", kind="mission",
            text=t("activity.mission", lang, field=t(mission.field.name, lang),
                   status=t(f"mission.status.{mission.status}", lang)),
            at=mission.completed_at or mission.started_at or mission.created_at,
            link=f"/drone?mission={mission.id}",
        ))

    field_ids = [f.id for f in farm.fields]
    analyses = db.scalars(
        select(m.AIAnalysis).where(m.AIAnalysis.user_id == user.id)
        .where(m.AIAnalysis.field_id.in_(field_ids))
        .order_by(m.AIAnalysis.created_at.desc()).limit(MAX_ACTIVITY)
    ).all()
    for analysis in analyses:
        field = t(analysis.field.name, lang) if analysis.field else "-"
        items.append(schemas.ActivityOut(
            id=f"analysis-{analysis.id}", kind="analysis",
            text=t("activity.analysis", lang, field=field,
                   issue=t(f"issue.{analysis.result['issue']}", lang)),
            at=analysis.created_at, link=f"/ai-doctor?analysis={analysis.id}",
        ))
        for action in analysis.actions:
            items.append(schemas.ActivityOut(
                id=f"action-{action.id}", kind="decision",
                text=t("activity.decision", lang, field=field,
                       decision=t(f"decision.{action.decision}", lang)),
                at=action.created_at, link=f"/ai-doctor?analysis={analysis.id}",
            ))
    for field in farm.fields:
        items.append(schemas.ActivityOut(
            id=f"field-{field.id}", kind="field",
            text=t("activity.field", lang, field=t(field.name, lang)),
            at=field.created_at, link=f"/fields/{field.id}",
        ))
    items.sort(key=lambda item: item.at, reverse=True)
    return items[:MAX_ACTIVITY]


def dashboard(db: Session, farm: m.Farm, user: m.User, lang: str) -> schemas.DashboardOut:
    mission = latest_mission(db, farm)
    return schemas.DashboardOut(
        weather=schemas.WeatherOut(**get_weather().current(farm.latitude, farm.longitude)),
        stats=farm_stats(farm),
        latest_mission=mission_out(mission, lang) if mission else None,
        health=health_slices(farm, lang),
        alerts=_alerts(farm, lang),
        activity=_activity(db, farm, user, lang),
    )


def map_view(farm: m.Farm, lang: str) -> schemas.MapOut:
    fields = farm.fields
    points = [tuple(p) for f in fields for p in f.coordinates]
    if points:
        pad = BOUNDARY_PAD_M / METERS_PER_DEG_LAT
        pad_lng = pad * 1.6  # roughly compensates for longitude convergence at these latitudes
        north, south = max(p[0] for p in points) + pad, min(p[0] for p in points) - pad
        west, east = min(p[1] for p in points) - pad_lng, max(p[1] for p in points) + pad_lng
        boundary = [(north, west), (north, east), (south, east), (south, west)]
        center = ((north + south) / 2, (west + east) / 2)
    else:
        boundary, center = [], (farm.latitude, farm.longitude)
    return schemas.MapOut(
        is_demo=farm.owner.is_demo,
        boundary=boundary,
        center=center,
        fields=[field_out(f, lang) for f in fields],
        zones=[zone_out(z, lang) for f in fields for z in f.zones],
        anomalies=[anomaly_out(a, lang) for f in fields for a in f.anomalies if a.status == "open"],
    )


def ndvi_grid(field: m.Field, lang: str) -> schemas.NdviGridOut:
    on = field.last_monitored_at.date() if field.last_monitored_at else date.today()
    grid = sample_ndvi_grid(field, on)
    stats = summarize_ndvi(grid)
    return schemas.NdviGridOut(
        is_demo=True,
        field_id=field.id,
        field_name=t(field.name, lang),
        rows=grid.shape[0],
        cols=grid.shape[1],
        values=[[None if np.isnan(v) else round(float(v), 3) for v in row] for row in grid],
        **stats,
    )


def analytics(farm: m.Farm, lang: str) -> schemas.AnalyticsOut:
    fields = farm.fields
    comparison = []
    series = []
    by_date: dict[date, dict[str, float]] = defaultdict(dict)
    history = []
    for field in fields:
        records = field.ndvi_records
        name = t(field.name, lang)
        latest = records[-1] if records else None
        previous = records[-2] if len(records) > 1 else None
        comparison.append(schemas.FieldComparison(
            field_id=field.id, name=name, ndvi=field.ndvi_mean,
            change=round(latest.mean - previous.mean, 3) if latest and previous else None,
            healthy_pct=latest.healthy_pct if latest else 0,
            attention_pct=latest.attention_pct if latest else 0,
            critical_pct=latest.critical_pct if latest else 0,
            open_anomalies=sum(1 for a in field.anomalies if a.status == "open"),
        ))
        if records:
            series.append({"id": field.id, "name": name})
        for record in records:
            by_date[record.recorded_on][field.id] = record.mean
            history.append(schemas.MonitoringEvent(
                id=record.id, date=record.recorded_on, field_name=name,
                ndvi=record.mean, source=record.source,
            ))

    trend = [
        schemas.TrendPoint(date=day, values=values,
                           average=round(sum(values.values()) / len(values), 3))
        for day, values in sorted(by_date.items())
    ]
    anomalies = [a for f in fields for a in f.anomalies]
    types = Counter(a.type for a in anomalies)
    severities = Counter(a.severity for a in anomalies)
    history.sort(key=lambda e: e.date, reverse=True)
    return schemas.AnalyticsOut(
        is_demo=True,
        fields=comparison,
        series=series,
        trend=trend,
        health=health_slices(farm, lang),
        anomalies_by_type=[
            schemas.CountItem(key=k, label=t(f"anomaly.{k}", lang), count=v)
            for k, v in types.most_common()
        ],
        anomalies_by_severity=[
            schemas.CountItem(key=k, label=t(f"severity.{k}", lang), count=v)
            for k, v in severities.most_common()
        ],
        anomalies_open=sum(1 for a in anomalies if a.status == "open"),
        anomalies_resolved=sum(1 for a in anomalies if a.status == "resolved"),
        history=history[:12],
    )


def assistant_context(db: Session, farm: m.Farm, lang: str) -> dict:
    """The farm facts given to the assistant. Names and labels are in the user's language."""
    stats = farm_stats(farm)
    mission = latest_mission(db, farm)
    return {
        "farm": {
            "name": farm.name, "region": farm.region, "total_area": stats.total_area,
            "avg_ndvi": stats.avg_ndvi, "data_is_demo": farm.owner.is_demo,
        },
        "weather": get_weather().current(farm.latitude, farm.longitude),
        "fields": [
            {
                "name": t(f.name, lang),
                "crop": t(f"crop.{f.crop_type}", lang),
                "area": f.area,
                "ndvi": f.ndvi_mean,
                "health": t(f"health.{f.health_status}", lang),
                "last_check": f.last_monitored_at.date().isoformat() if f.last_monitored_at else None,
                "open_anomalies": [t(f"anomaly.{a.type}", lang) for a in f.anomalies if a.status == "open"],
                "zones": [
                    {"name": t(z.name, lang), "ndvi": z.ndvi, "health": t(f"health.{z.health_status}", lang)}
                    for z in f.zones
                ],
            }
            for f in farm.fields
        ],
        "latest_mission": {
            "field": t(mission.field.name, lang),
            "status": t(f"mission.status.{mission.status}", lang),
            "date": mission.created_at.date().isoformat(),
            "simulated": mission.flight_data.get("simulated", True),
        } if mission else None,
    }
