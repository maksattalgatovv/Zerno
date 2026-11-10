"""SQLAlchemy ORM models."""

import uuid
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


def _pk() -> Mapped[str]:
    return mapped_column(String(36), primary_key=True, default=new_id)


def _ts(**kwargs: Any) -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), default=utcnow, **kwargs)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = _pk()
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20), default="farmer")  # farmer|agronomist|admin
    language: Mapped[str] = mapped_column(String(2), default="en")
    units: Mapped[str] = mapped_column(String(10), default="metric")  # metric|imperial
    notification_prefs: Mapped[dict] = mapped_column(JSON, default=dict)
    integration_prefs: Mapped[dict] = mapped_column(JSON, default=dict)
    emergency_contacts: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    onboarded: Mapped[bool] = mapped_column(Boolean, default=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _ts()

    farms: Mapped[list["Farm"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[str] = _pk()
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Farm(Base):
    __tablename__ = "farms"

    id: Mapped[str] = _pk()
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    region: Mapped[str] = mapped_column(String(120))
    location: Mapped[str] = mapped_column(String(200), default="")
    latitude: Mapped[float] = mapped_column(Float, default=51.7)
    longitude: Mapped[float] = mapped_column(Float, default=71.1)
    main_crop: Mapped[str] = mapped_column(String(30), default="wheat")
    created_at: Mapped[datetime] = _ts()

    owner: Mapped[User] = relationship(back_populates="farms")
    fields: Mapped[list["Field"]] = relationship(back_populates="farm", cascade="all, delete-orphan")
    drones: Mapped[list["Drone"]] = relationship(back_populates="farm", cascade="all, delete-orphan")
    livestock_groups: Mapped[list["LivestockGroup"]] = relationship(cascade="all, delete-orphan")


class Field(Base):
    __tablename__ = "fields"

    id: Mapped[str] = _pk()
    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    region: Mapped[str] = mapped_column(String(120), default="")
    area: Mapped[float] = mapped_column(Float)  # hectares
    crop_type: Mapped[str] = mapped_column(String(30))
    coordinates: Mapped[list] = mapped_column(JSON)  # polygon [[lat, lng], ...]
    center_lat: Mapped[float] = mapped_column(Float)
    center_lng: Mapped[float] = mapped_column(Float)
    planting_date: Mapped[date | None] = mapped_column(Date)
    last_monitored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    health_status: Mapped[str] = mapped_column(String(12), default="unknown", index=True)
    ndvi_mean: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = _ts()

    farm: Mapped[Farm] = relationship(back_populates="fields")
    zones: Mapped[list["Zone"]] = relationship(back_populates="field", cascade="all, delete-orphan")
    anomalies: Mapped[list["Anomaly"]] = relationship(back_populates="field", cascade="all, delete-orphan")
    ndvi_records: Mapped[list["NdviRecord"]] = relationship(
        back_populates="field", cascade="all, delete-orphan", order_by="NdviRecord.recorded_on"
    )


class Zone(Base):
    """A monitored sub-area of a field."""

    __tablename__ = "zones"

    id: Mapped[str] = _pk()
    field_id: Mapped[str] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))  # i18n key or literal
    polygon: Mapped[list] = mapped_column(JSON)
    ndvi: Mapped[float | None] = mapped_column(Float)
    health_status: Mapped[str] = mapped_column(String(12), default="unknown")

    field: Mapped[Field] = relationship(back_populates="zones")


class Anomaly(Base):
    __tablename__ = "anomalies"

    id: Mapped[str] = _pk()
    field_id: Mapped[str] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"), index=True)
    zone_id: Mapped[str | None] = mapped_column(ForeignKey("zones.id", ondelete="SET NULL"))
    mission_id: Mapped[str | None] = mapped_column(ForeignKey("drone_missions.id", ondelete="SET NULL"))
    type: Mapped[str] = mapped_column(String(30))  # water_stress|nutrient|weeds|disease
    severity: Mapped[str] = mapped_column(String(10))  # warning|critical
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    area_ha: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(10), default="open", index=True)  # open|resolved
    detected_at: Mapped[datetime] = _ts()
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=True)

    field: Mapped[Field] = relationship(back_populates="anomalies")


class NdviRecord(Base):
    """A vegetation-index observation of a whole field."""

    __tablename__ = "ndvi_records"
    __table_args__ = (Index("ix_ndvi_field_date", "field_id", "recorded_on"),)

    id: Mapped[str] = _pk()
    field_id: Mapped[str] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"))
    mission_id: Mapped[str | None] = mapped_column(ForeignKey("drone_missions.id", ondelete="SET NULL"))
    recorded_on: Mapped[date] = mapped_column(Date)
    mean: Mapped[float] = mapped_column(Float)
    minimum: Mapped[float] = mapped_column(Float)
    maximum: Mapped[float] = mapped_column(Float)
    healthy_pct: Mapped[float] = mapped_column(Float)
    attention_pct: Mapped[float] = mapped_column(Float)
    critical_pct: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(12), default="demo")  # demo|simulated|multispectral

    field: Mapped[Field] = relationship(back_populates="ndvi_records")


class Drone(Base):
    __tablename__ = "drones"

    id: Mapped[str] = _pk()
    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    model: Mapped[str] = mapped_column(String(80))
    serial: Mapped[str] = mapped_column(String(40), default="")
    adapter: Mapped[str] = mapped_column(String(20), default="simulated")
    status: Mapped[str] = mapped_column(String(20), default="idle")  # idle|charging|in_mission|offline
    battery_level: Mapped[float] = mapped_column(Float, default=100)
    gps_status: Mapped[str] = mapped_column(String(10), default="strong")  # strong|weak|none
    connection_status: Mapped[str] = mapped_column(String(14), default="connected")
    home_lat: Mapped[float] = mapped_column(Float)
    home_lng: Mapped[float] = mapped_column(Float)
    last_mission: Mapped[str | None] = mapped_column(String(36))
    last_mission_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    farm: Mapped[Farm] = relationship(back_populates="drones")
    missions: Mapped[list["DroneMission"]] = relationship(back_populates="drone", cascade="all, delete-orphan")


class DroneMission(Base):
    __tablename__ = "drone_missions"
    __table_args__ = (Index("ix_mission_drone_status", "drone_id", "status"),)

    id: Mapped[str] = _pk()
    drone_id: Mapped[str] = mapped_column(ForeignKey("drones.id", ondelete="CASCADE"))
    field_id: Mapped[str] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(14), default="planned")
    created_at: Mapped[datetime] = _ts()
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    flight_data: Mapped[dict] = mapped_column(JSON, default=dict)

    drone: Mapped[Drone] = relationship(back_populates="missions")
    field: Mapped[Field] = relationship()
    images: Mapped[list["Image"]] = relationship(back_populates="mission")


class Image(Base):
    __tablename__ = "images"

    id: Mapped[str] = _pk()
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    mission_id: Mapped[str | None] = mapped_column(ForeignKey("drone_missions.id", ondelete="SET NULL"), index=True)
    field_id: Mapped[str | None] = mapped_column(ForeignKey("fields.id", ondelete="SET NULL"), index=True)
    image_url: Mapped[str] = mapped_column(String(300))  # storage key
    gps_coordinates: Mapped[list | None] = mapped_column(JSON)
    captured_at: Mapped[datetime] = _ts()
    source: Mapped[str] = mapped_column(String(12), default="upload")  # upload|mission
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False)

    mission: Mapped[DroneMission | None] = relationship(back_populates="images")


class AIAnalysis(Base):
    __tablename__ = "ai_analyses"

    id: Mapped[str] = _pk()
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    field_id: Mapped[str | None] = mapped_column(ForeignKey("fields.id", ondelete="SET NULL"), index=True)
    image_id: Mapped[str] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"))
    crop_type: Mapped[str] = mapped_column(String(30))
    model_name: Mapped[str] = mapped_column(String(60))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    result: Mapped[dict] = mapped_column(JSON)
    confidence: Mapped[float] = mapped_column(Float)
    recommendations: Mapped[list] = mapped_column(JSON)  # i18n keys
    needs_agronomist: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _ts(index=True)

    image: Mapped[Image] = relationship()
    field: Mapped[Field | None] = relationship()
    actions: Mapped[list["FarmerAction"]] = relationship(
        back_populates="analysis", cascade="all, delete-orphan", order_by="FarmerAction.created_at"
    )


class FarmerAction(Base):
    __tablename__ = "farmer_actions"

    id: Mapped[str] = _pk()
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    analysis_id: Mapped[str] = mapped_column(ForeignKey("ai_analyses.id", ondelete="CASCADE"), index=True)
    decision: Mapped[str] = mapped_column(String(10))  # approved|rejected
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = _ts()

    analysis: Mapped[AIAnalysis] = relationship(back_populates="actions")


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notification_user_read", "user_id", "read"),)

    id: Mapped[str] = _pk()
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(120))  # i18n key or literal
    message: Mapped[str] = mapped_column(Text)  # i18n key or literal
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    severity: Mapped[str] = mapped_column(String(10), default="info")  # info|success|warning|critical
    link: Mapped[str | None] = mapped_column(String(200))
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _ts(index=True)


class Emergency(Base):
    """A farmer-raised incident, with a timeline of everything done about it."""

    __tablename__ = "emergencies"

    id: Mapped[str] = _pk()
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    field_id: Mapped[str | None] = mapped_column(ForeignKey("fields.id", ondelete="SET NULL"))
    anomaly_id: Mapped[str | None] = mapped_column(ForeignKey("anomalies.id", ondelete="SET NULL"))
    mission_id: Mapped[str | None] = mapped_column(ForeignKey("drone_missions.id", ondelete="SET NULL"))
    type: Mapped[str] = mapped_column(String(12))  # fire|injury|other
    status: Mapped[str] = mapped_column(String(10), default="active", index=True)  # active|resolved
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    log: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = _ts(index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    field: Mapped[Field | None] = relationship()
    farm: Mapped[Farm] = relationship()

    def add_log(self, code: str, **params: Any) -> None:
        # A new list, so SQLAlchemy sees the JSON column as changed.
        self.log = [*(self.log or []), {"code": code, "params": params, "at": utcnow().isoformat()}]


class LivestockGroup(Base):
    """A herd or flock of one species, with its current head count."""

    __tablename__ = "livestock_groups"

    id: Mapped[str] = _pk()
    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    # The pasture the drone flies over to count this group. None for animals kept indoors.
    field_id: Mapped[str | None] = mapped_column(ForeignKey("fields.id", ondelete="SET NULL"), index=True)
    species: Mapped[str] = mapped_column(String(12))  # cattle|sheep|goat|horse|camel|poultry|other
    name: Mapped[str] = mapped_column(String(120))  # i18n key or literal
    head_count: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = _ts()

    field: Mapped[Field | None] = relationship()
    events: Mapped[list["LivestockEvent"]] = relationship(
        back_populates="group", cascade="all, delete-orphan", order_by="LivestockEvent.created_at"
    )


class LivestockEvent(Base):
    """One change to a group's head count. Together they explain the current number."""

    __tablename__ = "livestock_events"

    id: Mapped[str] = _pk()
    group_id: Mapped[str] = mapped_column(ForeignKey("livestock_groups.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(12))  # birth|purchase|sale|death|recount|drone_count
    change: Mapped[int] = mapped_column(Integer)  # signed difference
    count_after: Mapped[int] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(String(300), default="")
    # Set for drone counts: which flight counted, and how sure the detector was.
    mission_id: Mapped[str | None] = mapped_column(ForeignKey("drone_missions.id", ondelete="SET NULL"))
    confidence: Mapped[float | None] = mapped_column(Float)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _ts(index=True)

    group: Mapped[LivestockGroup] = relationship(back_populates="events")


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (Index("ix_chat_user_farm", "user_id", "farm_id", "created_at"),)

    id: Mapped[str] = _pk()
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(10))  # user|assistant
    content: Mapped[str] = mapped_column(Text)
    provider: Mapped[str] = mapped_column(String(30), default="")
    created_at: Mapped[datetime] = _ts()


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = _pk()
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(200))
    language: Mapped[str] = mapped_column(String(2))
    storage_key: Mapped[str] = mapped_column(String(300))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = _ts()
