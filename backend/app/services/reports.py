"""PDF report generation with ReportLab. Text is rendered in the requested language."""

import io
from datetime import UTC, date, datetime
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Image as RLImage
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.adapters.storage import get_storage
from app.core.i18n import t
from app.db import models as m
from app.services.analytics import farm_stats

FONT_DIR = Path(__file__).resolve().parents[1] / "assets" / "fonts"
GREEN = colors.HexColor("#174C38")
MUTED = colors.HexColor("#778078")
LINE = colors.HexColor("#DDE3DC")
TINT = colors.HexColor("#F5F7F3")
WARNING_TINT = colors.HexColor("#FBF1DF")

# DejaVu covers Latin, Cyrillic and the Kazakh letters. It must be registered before
# any Paragraph is created, because styles are resolved at construction time.
pdfmetrics.registerFont(TTFont("Zerno", FONT_DIR / "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("Zerno-Bold", FONT_DIR / "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFontFamily("Zerno", normal="Zerno", bold="Zerno-Bold",
                              italic="Zerno", boldItalic="Zerno-Bold")

BODY = ParagraphStyle("body", fontName="Zerno", fontSize=9.5, leading=14, textColor="#1E2923",
                      alignment=TA_LEFT)
SMALL = ParagraphStyle("small", parent=BODY, fontSize=8.5, leading=12, textColor=MUTED)
TITLE = ParagraphStyle("title", parent=BODY, fontName="Zerno-Bold", fontSize=19, leading=24,
                       textColor=GREEN)
H2 = ParagraphStyle("h2", parent=BODY, fontName="Zerno-Bold", fontSize=11.5, leading=16,
                    textColor=GREEN, spaceBefore=12, spaceAfter=5)
CELL = ParagraphStyle("cell", parent=BODY, fontSize=8.5, leading=11.5)
CELL_HEAD = ParagraphStyle("cellhead", parent=CELL, fontName="Zerno-Bold", textColor=GREEN)


def _p(text: object, style: ParagraphStyle = BODY) -> Paragraph:
    return Paragraph(escape(str(text)), style)


def _fmt_dt(value: datetime | None) -> str:
    return value.strftime("%Y-%m-%d %H:%M UTC") if value else "-"


def _fmt_date(value: date | datetime | None) -> str:
    return value.strftime("%Y-%m-%d") if value else "-"


def _ndvi(value: float | None) -> str:
    return "-" if value is None else f"{value:.2f}"


def _table(rows: list[list[object]], widths: list[float] | None = None, header: bool = True) -> Table:
    cells = [
        [_p(c, CELL_HEAD if header and i == 0 else CELL) for c in row]
        for i, row in enumerate(rows)
    ]
    table = Table(cells, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    style = [
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if header:
        style.append(("BACKGROUND", (0, 0), (-1, 0), TINT))
    table.setStyle(TableStyle(style))
    return table


def _pairs(rows: list[tuple[str, object]], lang: str) -> Table:
    return _table([[t(key, lang), value] for key, value in rows], [55 * mm, 115 * mm], header=False)


def _header(title: str, farm: m.Farm, lang: str) -> list:
    notice = Table([[_p(t("report.demo_notice", lang), CELL)]], colWidths=[170 * mm])
    notice.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), WARNING_TINT),
                                ("TOPPADDING", (0, 0), (-1, -1), 6),
                                ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    meta = (f"{t('report.farm', lang)}: {farm.name}  ·  {t('report.region', lang)}: {farm.region}  ·  "
            f"{t('report.generated', lang)}: {_fmt_dt(datetime.now(UTC))}")
    return [_p("ZERNO", H2), _p(title, TITLE), Spacer(1, 3), _p(meta, SMALL), Spacer(1, 8), notice]


def _anomaly_rows(anomalies: list[m.Anomaly], lang: str) -> list[list[object]]:
    head = [t(k, lang) for k in ("report.type", "report.field", "report.severity", "report.date")]
    return [head] + [
        [t(f"anomaly.{a.type}", lang), t(a.field.name, lang), t(f"severity.{a.severity}", lang),
         _fmt_date(a.detected_at)]
        for a in anomalies
    ]


def _field_rows(fields: list[m.Field], lang: str) -> list[list[object]]:
    head = [t(k, lang) for k in ("report.field", "report.crop", "report.area", "report.ndvi",
                                 "report.health", "report.last_check")]
    return [head] + [
        [t(f.name, lang), t(f"crop.{f.crop_type}", lang), f"{f.area:g}", _ndvi(f.ndvi_mean),
         t(f"health.{f.health_status}", lang), _fmt_date(f.last_monitored_at)]
        for f in fields
    ]


def field_report(farm: m.Farm, field: m.Field, lang: str, title: str) -> list:
    story = _header(title, farm, lang)
    story += [_p(t("report.summary", lang), H2), _pairs([
        ("report.field", t(field.name, lang)),
        ("report.crop", t(f"crop.{field.crop_type}", lang)),
        ("report.area", f"{field.area:g}"),
        ("report.planted", _fmt_date(field.planting_date)),
        ("report.last_check", _fmt_date(field.last_monitored_at)),
        ("report.ndvi", _ndvi(field.ndvi_mean)),
        ("report.health", t(f"health.{field.health_status}", lang)),
    ], lang)]
    if field.zones:
        story += [_p(t("report.zones", lang), H2), _table(
            [[t("report.zone", lang), t("report.ndvi", lang), t("report.health", lang)]] + [
                [t(z.name, lang), _ndvi(z.ndvi), t(f"health.{z.health_status}", lang)]
                for z in field.zones
            ])]
    opened = [a for a in field.anomalies if a.status == "open"]
    if opened:
        story += [_p(t("report.anomalies", lang), H2), _table(_anomaly_rows(opened, lang))]
    if field.ndvi_records:
        story += [_p(t("report.history", lang), H2), _table(
            [[t("report.date", lang), t("report.ndvi", lang)]]
            + [[_fmt_date(r.recorded_on), _ndvi(r.mean)] for r in field.ndvi_records[-10:]]
        )]
    return story


def crop_health_report(farm: m.Farm, lang: str, title: str) -> list:
    stats = farm_stats(farm)
    story = _header(title, farm, lang)
    story += [_p(t("report.summary", lang), H2), _pairs([
        ("report.total_area", f"{stats.total_area:g}"),
        ("report.fields", stats.field_count),
        ("report.avg_ndvi", _ndvi(stats.avg_ndvi)),
        ("report.open_anomalies", stats.open_anomalies),
    ], lang)]
    story += [_p(t("report.fields_overview", lang), H2), _table(_field_rows(farm.fields, lang))]
    opened = [a for f in farm.fields for a in f.anomalies if a.status == "open"]
    if opened:
        story += [_p(t("report.anomalies", lang), H2), _table(_anomaly_rows(opened, lang))]
    return story


def mission_report(farm: m.Farm, mission: m.DroneMission, lang: str, title: str) -> list:
    data = mission.flight_data
    start, end = data.get("battery_start"), data.get("battery")
    used = round(start - end, 1) if start is not None and end is not None else "-"
    story = _header(title, farm, lang)
    story += [_p(t("report.summary", lang), H2), _pairs([
        ("report.field", t(mission.field.name, lang)),
        ("report.drone", mission.drone.model),
        ("report.status", t(f"mission.status.{mission.status}", lang)),
        ("report.started", _fmt_dt(mission.started_at)),
        ("report.finished", _fmt_dt(mission.completed_at)),
        ("report.distance", round(data["distance_m"] / 1000, 1)),
        ("report.altitude", data["altitude_m"]),
        ("report.battery_used", used),
        ("report.photos", data.get("photos_taken", 0)),
    ], lang)]
    return story


def analysis_report(farm: m.Farm, analysis: m.AIAnalysis, lang: str, title: str) -> list:
    action = analysis.actions[-1] if analysis.actions else None
    decision = t(f"decision.{action.decision}", lang) if action else t("report.pending", lang)
    field = t(analysis.field.name, lang) if analysis.field else "-"
    story = _header(title, farm, lang)
    story += [_p(t("report.summary", lang), H2), _pairs([
        ("report.field", field),
        ("report.crop", t(f"crop.{analysis.crop_type}", lang)),
        ("report.date", _fmt_dt(analysis.created_at)),
        ("report.model", analysis.model_name),
        ("report.result", t(f"issue.{analysis.result['issue']}", lang)),
        ("report.confidence", f"{analysis.confidence * 100:.0f}%"),
        ("report.agronomist", t("report.yes" if analysis.needs_agronomist else "report.no", lang)),
        ("report.decision", decision),
    ], lang)]
    try:
        data = get_storage().read(analysis.image.image_url)
        story += [Spacer(1, 8), RLImage(io.BytesIO(data), width=90 * mm, height=59 * mm, kind="proportional", hAlign="LEFT")]
    except (OSError, ValueError):
        pass  # A missing image shouldn't block the report.
    if analysis.is_demo:
        story += [Spacer(1, 6), _p(t("vision.demo_disclaimer", lang), SMALL)]
    story.append(_p(t("report.symptoms", lang), H2))
    story += [_p(f"• {t(f'symptom.{s['code']}', lang)}") for s in analysis.result["symptoms"]]
    story.append(_p(t("report.recommendations", lang), H2))
    story += [_p(f"{i}. {t(key, lang)}") for i, key in enumerate(analysis.recommendations, 1)]
    return story


def build_pdf(story: list, title: str) -> bytes:
    buffer = io.BytesIO()

    def _footer(canvas, doc) -> None:
        canvas.setFont("Zerno", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(20 * mm, 11 * mm, "ZERNO · Smart Agriculture. Smarter Future.")
        canvas.drawRightString(190 * mm, 11 * mm, str(doc.page))

    document = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                                 topMargin=16 * mm, bottomMargin=18 * mm, title=title, author="ZERNO")
    document.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()
