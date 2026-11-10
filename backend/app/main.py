"""FastAPI application entry point."""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import analyses, auth, drones, emergencies, farms, livestock, misc
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.db.session import SessionLocal
from app.services.mission_runner import runner
from app.services.missions import fail_interrupted_missions

settings = get_settings()
logging.basicConfig(
    level=settings.log_level, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s"
)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    runner.bind(asyncio.get_running_loop())
    with SessionLocal() as db:
        fail_interrupted_missions(db)
    yield
    await runner.shutdown()


app = FastAPI(title="ZERNO API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)
install_error_handlers(app)

for module in (auth, farms, drones, analyses, emergencies, livestock, misc):
    app.include_router(module.router, prefix="/api")

# Only the public/ subtree is served. Generated reports live outside it.
public_dir = settings.storage_dir / "public"
public_dir.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=public_dir), name="media")
