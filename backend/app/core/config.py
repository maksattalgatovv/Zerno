"""Centralised, environment-driven configuration. Nothing secret is hardcoded."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    # Core
    database_url: str
    jwt_secret: str
    jwt_expire_minutes: int = 60 * 24
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    log_level: str = "INFO"

    # Demo behaviour
    demo_mode: bool = True
    # There is no email provider yet. When true, /auth/forgot-password returns the
    # reset token to the caller. Local development only: never enable in production.
    expose_reset_tokens: bool = False

    # Storage
    storage_backend: str = "local"  # local | s3
    storage_dir: Path = BACKEND_DIR / "storage"
    public_api_url: str = ""  # empty: same origin, through the frontend proxy
    max_upload_mb: int = 10
    s3_bucket: str | None = None
    s3_endpoint_url: str | None = None

    # AI
    vision_model: str = "demo"  # demo | yolo
    yolo_weights_path: Path | None = None
    anthropic_api_key: str | None = None
    assistant_model: str = "claude-opus-5-5"

    # Drone simulator
    sim_mission_seconds: float = 40.0
    sim_tick_seconds: float = 0.5

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
