"""Pydantic request and response models. The frontend's types are generated from these."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field as F, field_validator

Language = Literal["en", "ru", "kk"]
Health = Literal["healthy", "attention", "critical", "unknown"]
CropType = Literal["wheat", "barley", "canola", "sunflower", "flax", "pasture", "other"]
Severity = Literal["info", "success", "warning", "critical"]
ReportType = Literal["field_monitoring", "drone_mission", "crop_health", "ai_analysis"]
LatLngPair = tuple[float, float]


class Orm(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Auth and users ---
class RegisterIn(BaseModel):
    name: str = F(min_length=2, max_length=120)
    email: EmailStr
    password: str = F(min_length=8, max_length=128)
    language: Language = "en"


class LoginIn(BaseModel):
    email: EmailStr
    password: str = F(min_length=1, max_length=128)


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ForgotPasswordOut(BaseModel):
    sent: bool = True
    # Only present when EXPOSE_RESET_TOKENS is on, because no email service exists yet.
    dev_reset_token: str | None = None


class ResetPasswordIn(BaseModel):
    token: str = F(min_length=10, max_length=200)
    password: str = F(min_length=8, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class NotificationPrefs(BaseModel):
    missions: bool = True
    ai: bool = True
    alerts: bool = True


class IntegrationPrefs(BaseModel):
    sim_speed: Literal["slow", "normal", "fast"] = "normal"


class EmergencyContact(BaseModel):
    name: str = F(min_length=1, max_length=80)
    phone: str = F(pattern=r"^\+?[0-9][0-9 ()-]{5,19}$")


class UserOut(Orm):
    id: str
    name: str
    email: str
    role: str
    language: Language
    units: Literal["metric", "imperial"]
    notification_prefs: NotificationPrefs
    integration_prefs: IntegrationPrefs
    emergency_contacts: list[EmergencyContact]
    onboarded: bool
    is_demo: bool


class UserUpdate(BaseModel):
    name: str | None = F(default=None, min_length=2, max_length=120)
    role: Literal["farmer", "agronomist"] | None = None  # admin is never self-assigned
    language: Language | None = None
    units: Literal["metric", "imperial"] | None = None
    notification_prefs: NotificationPrefs | None = None
    integration_prefs: IntegrationPrefs | None = None
    emergency_contacts: list[EmergencyContact] | None = F(default=None, max_length=10)
    onboarded: bool | None = None


class PasswordChange(BaseModel):
    current_password: str = F(min_length=1, max_length=128)
    new_password: str = F(min_length=8, max_length=128)


# --- Farms and fields ---
class FarmIn(BaseModel):
    name: str = F(min_length=2, max_length=120)
    region: str = F(min_length=2, max_length=120)
    location: str = F(default="", max_length=200)
    latitude: float = F(default=51.7, ge=-90, le=90)
    longitude: float = F(default=71.1, ge=-180, le=180)
    main_crop: CropType = "wheat"


class FarmOut(Orm):
    id: str
    name: str
    region: str
    location: str
    latitude: float
    longitude: float
    main_crop: str
    field_count: int
    total_area: float


class FieldIn(BaseModel):
    name: str = F(min_length=2, max_length=120)
    region: str = F(default="", max_length=120)
    area: float = F(gt=0, le=100_000)
    crop_type: CropType
    latitude: float = F(ge=-90, le=90)
    longitude: float = F(ge=-180, le=180)
    planting_date: date | None = None
    coordinates: list[LatLngPair] | None = F(default=None, min_length=3, max_length=200)

    @field_validator("planting_date")
    @classmethod
    def _not_too_far_ahead(cls, value: date | None) -> date | None:
        if value and value.year > date.today().year + 1:
            raise ValueError("Planting date is too far in the future")
        return value


class FieldOut(BaseModel):
    id: str
    farm_id: str
    name: str
    region: str
    area: float
    crop_type: CropType
    crop_label: str
    coordinates: list[LatLngPair]
    center_lat: float
    center_lng: float
    planting_date: date | None
    last_monitored_at: datetime | None
    health_status: Health
    ndvi_mean: float | None
    open_anomalies: int


class ZoneOut(BaseModel):
    id: str
    field_id: str
    name: str
    polygon: list[LatLngPair]
    ndvi: float | None
    health_status: Health
    note: str


class AnomalyOut(BaseModel):
    id: str
    field_id: str
    field_name: str
    zone_name: str | None
    type: str
    title: str
    description: str
    severity: Literal["warning", "critical"]
    latitude: float
    longitude: float
    area_ha: float
    status: Literal["open", "resolved"]
    detected_at: datetime
    is_simulated: bool


class AnomalyUpdate(BaseModel):
    status: Literal["open", "resolved"]


class NdviPoint(Orm):
    recorded_on: date
    mean: float
    minimum: float
    maximum: float
    healthy_pct: float
    attention_pct: float
    critical_pct: float
    source: str


class FieldDetailOut(FieldOut):
    zones: list[ZoneOut]
    anomalies: list[AnomalyOut]
    history: list[NdviPoint]
    missions: list["MissionOut"]
    analyses: list["AnalysisOut"]


class MapOut(BaseModel):
    is_demo: bool
    boundary: list[LatLngPair]
    center: LatLngPair
    fields: list[FieldOut]
    zones: list[ZoneOut]
    anomalies: list[AnomalyOut]


# --- Drones ---
class PreflightCheck(BaseModel):
    code: str
    label: str
    passed: bool


class DroneOut(Orm):
    id: str
    farm_id: str
    model: str
    serial: str
    adapter: str
    is_simulated: bool
    status: Literal["idle", "charging", "in_mission", "offline"]
    battery_level: float
    gps_status: str
    connection_status: str
    home_lat: float
    home_lng: float
    last_mission: str | None
    last_mission_at: datetime | None


MissionPurpose = Literal["survey", "livestock"]


class MissionPlanIn(BaseModel):
    drone_id: str
    field_id: str
    altitude_m: float = F(default=60, ge=20, le=120)
    # survey: crop health and NDVI. livestock: count the animals grazing on the field.
    purpose: MissionPurpose = "survey"


class MissionStartIn(BaseModel):
    operator_confirmed: bool


class ImageOut(BaseModel):
    id: str
    url: str
    source: Literal["upload", "mission"]
    is_simulated: bool
    captured_at: datetime
    gps_coordinates: LatLngPair | None
    field_id: str | None
    mission_id: str | None


class LivestockCountOut(BaseModel):
    group_id: str
    group_name: str
    species: str
    expected: int
    counted: int
    confidence: float


class MissionOut(BaseModel):
    id: str
    purpose: MissionPurpose
    drone_id: str
    drone_model: str
    field_id: str
    field_name: str
    status: Literal["planned", "in_progress", "returning", "completed", "aborted", "cancelled", "failed"]
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    is_simulated: bool
    phase: str | None
    progress: float
    battery: float | None
    position: LatLngPair | None
    route: list[LatLngPair]
    track: list[LatLngPair]
    home: LatLngPair
    altitude_m: float
    distance_m: float
    duration_min: float
    battery_needed: float
    battery_start: float | None
    photos_taken: int
    return_reason: str | None
    preflight: list[PreflightCheck]
    livestock_counts: list[LivestockCountOut]


class MissionDetailOut(MissionOut):
    images: list[ImageOut]


# --- AI analysis ---
class AnalysisIn(BaseModel):
    image_id: str
    crop_type: CropType
    field_id: str | None = None


class SymptomOut(BaseModel):
    code: str
    label: str
    coverage_pct: float


class AnnotationOut(BaseModel):
    x: float
    y: float
    w: float
    h: float
    label: str


class ActionIn(BaseModel):
    decision: Literal["approved", "rejected"]
    comment: str = F(default="", max_length=1000)


class ActionOut(Orm):
    id: str
    decision: Literal["approved", "rejected"]
    comment: str
    created_at: datetime


class AnalysisOut(BaseModel):
    id: str
    field_id: str | None
    field_name: str | None
    image: ImageOut
    crop_type: str
    crop_label: str
    model_name: str
    is_demo: bool
    disclaimer: str | None
    issue: str
    issue_label: str
    symptoms: list[SymptomOut]
    annotations: list[AnnotationOut]
    metrics: dict[str, float]
    confidence: float
    recommendations: list[str]
    needs_agronomist: bool
    created_at: datetime
    action: ActionOut | None


# --- Dashboard and analytics ---
class WeatherOut(BaseModel):
    is_demo: bool
    temperature_c: float
    condition: str
    humidity_pct: float
    wind_kmh: float
    rain_next_3d_mm: float


class HealthSlice(BaseModel):
    status: Health
    label: str
    area: float
    fields: int


class StatsOut(BaseModel):
    total_area: float
    field_count: int
    avg_ndvi: float | None
    open_anomalies: int
    livestock_total: int


class AlertOut(BaseModel):
    id: str
    title: str
    message: str
    severity: Severity
    link: str
    created_at: datetime


class ActivityOut(BaseModel):
    id: str
    kind: Literal["mission", "analysis", "decision", "field"]
    text: str
    at: datetime
    link: str


class DashboardOut(BaseModel):
    weather: WeatherOut
    stats: StatsOut
    latest_mission: MissionOut | None
    health: list[HealthSlice]
    alerts: list[AlertOut]
    activity: list[ActivityOut]


class NdviGridOut(BaseModel):
    is_demo: bool
    field_id: str
    field_name: str
    rows: int
    cols: int
    values: list[list[float | None]]
    mean: float
    minimum: float
    maximum: float
    healthy_pct: float
    attention_pct: float
    critical_pct: float


class FieldComparison(BaseModel):
    field_id: str
    name: str
    ndvi: float | None
    change: float | None
    healthy_pct: float
    attention_pct: float
    critical_pct: float
    open_anomalies: int


class TrendPoint(BaseModel):
    date: date
    values: dict[str, float]
    average: float


class CountItem(BaseModel):
    key: str
    label: str
    count: int


class MonitoringEvent(BaseModel):
    id: str
    date: date
    field_name: str
    ndvi: float
    source: str


class AnalyticsOut(BaseModel):
    is_demo: bool
    fields: list[FieldComparison]
    series: list[dict[str, str]]  # id + name for each trend line
    trend: list[TrendPoint]
    health: list[HealthSlice]
    anomalies_by_type: list[CountItem]
    anomalies_by_severity: list[CountItem]
    anomalies_open: int
    anomalies_resolved: int
    history: list[MonitoringEvent]


# --- Emergencies ---
EmergencyType = Literal["fire", "injury", "other"]
DroneMode = Literal["recon", "suppress"]


class EmergencyIn(BaseModel):
    farm_id: str
    type: EmergencyType
    field_id: str | None = None
    send_drone: bool = True


class EmergencyDroneIn(BaseModel):
    mode: DroneMode


class EmergencyEventIn(BaseModel):
    code: Literal["siren", "call", "sms"]
    detail: str = F(default="", max_length=30)


class EmergencyLogOut(BaseModel):
    code: str
    text: str
    at: datetime


class EmergencyOut(BaseModel):
    id: str
    farm_id: str
    field_id: str | None
    field_name: str | None
    type: EmergencyType
    title: str
    status: Literal["active", "resolved"]
    latitude: float
    longitude: float
    mission_id: str | None
    created_at: datetime
    resolved_at: datetime | None
    log: list[EmergencyLogOut]


# --- Livestock ---
Species = Literal["cattle", "sheep", "goat", "horse", "camel", "poultry", "other"]
LivestockEventKind = Literal["birth", "purchase", "sale", "death", "recount", "drone_count"]
ManualEventKind = Literal["birth", "purchase", "sale", "death", "recount"]
MAX_HEADS = 1_000_000


class LivestockGroupIn(BaseModel):
    species: Species
    name: str = F(min_length=1, max_length=120)
    field_id: str | None = None
    head_count: int = F(default=0, ge=0, le=MAX_HEADS)
    notes: str = F(default="", max_length=2000)


class LivestockGroupUpdate(BaseModel):
    """Name and notes only. The count changes through events, so its history stays complete."""

    species: Species | None = None
    name: str | None = F(default=None, min_length=1, max_length=120)
    notes: str | None = F(default=None, max_length=2000)
    field_id: str | None = None  # send "" to take the group off its pasture


class LivestockEventIn(BaseModel):
    kind: ManualEventKind  # drone counts come only from flights
    # How many animals were born, bought, sold or died. For a recount, the new total.
    quantity: int = F(ge=0, le=MAX_HEADS)
    note: str = F(default="", max_length=300)


class LivestockEventOut(BaseModel):
    id: str
    group_id: str
    group_name: str
    species: Species
    kind: LivestockEventKind
    change: int
    count_after: int
    note: str
    mission_id: str | None
    confidence: float | None
    is_simulated: bool
    created_at: datetime


class DroneCountOut(BaseModel):
    counted: int
    confidence: float | None
    mission_id: str | None
    is_simulated: bool
    at: datetime


class LivestockGroupOut(BaseModel):
    id: str
    species: Species
    name: str
    head_count: int
    notes: str
    field_id: str | None
    field_name: str | None
    last_drone_count: DroneCountOut | None
    updated_at: datetime


class SpeciesCount(BaseModel):
    species: Species
    head_count: int
    groups: int


class LivestockOut(BaseModel):
    total: int
    by_species: list[SpeciesCount]
    groups: list[LivestockGroupOut]
    recent_events: list[LivestockEventOut]


# --- Notifications, assistant, reports, system ---
class NotificationOut(BaseModel):
    id: str
    title: str
    message: str
    severity: Severity
    link: str | None
    read: bool
    created_at: datetime


class ChatIn(BaseModel):
    farm_id: str
    content: str = F(min_length=1, max_length=2000)


class ChatMessageOut(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    provider: str
    is_demo: bool
    created_at: datetime


class AssistantInfo(BaseModel):
    provider: str
    is_demo: bool
    notice: str | None


class ReportIn(BaseModel):
    type: ReportType
    farm_id: str
    field_id: str | None = None
    mission_id: str | None = None
    analysis_id: str | None = None


class ReportOut(Orm):
    id: str
    farm_id: str
    type: ReportType
    title: str
    language: str
    size_bytes: int
    created_at: datetime


class ServiceStatus(BaseModel):
    key: str
    status: Literal["ok", "demo", "error"]
    detail: str


class SystemStatusOut(BaseModel):
    version: str
    demo_mode: bool
    services: list[ServiceStatus]


FieldDetailOut.model_rebuild()
