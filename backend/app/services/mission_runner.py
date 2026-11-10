"""Runs active flights in the background and persists telemetry as it arrives."""

import asyncio
import logging
from datetime import UTC, datetime

from app.adapters.drone import get_drone_adapter
from app.adapters.drone.base import MissionControl, MissionPlan, Telemetry
from app.core.config import get_settings
from app.db import models as m
from app.db.session import SessionLocal
from app.domain.flight import CRUISE_SPEED_MPS, MAX_SAMPLE_PHOTOS, RESERVE_PCT
from app.domain.geo import LatLng
from app.services.missions import ingest_results

log = logging.getLogger("zerno.runner")

SIM_SPEED_FACTOR = {"slow": 2.0, "normal": 1.0, "fast": 0.5}
EMERGENCY_FLIGHT_FACTOR = 0.5
CHARGE_STEP_PCT = 8
CHARGE_TICK_SECONDS = 0.5


class MissionRunner:
    """One process-local flight task per mission. See ARCHITECTURE.md for scaling notes."""

    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._controls: dict[str, MissionControl] = {}
        self._tasks: set[asyncio.Future] = set()

    def bind(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def _spawn(self, coroutine) -> None:
        if self._loop is None:
            raise RuntimeError("MissionRunner is not bound to an event loop")
        future = asyncio.run_coroutine_threadsafe(coroutine, self._loop)
        self._tasks.add(future)
        future.add_done_callback(self._tasks.discard)

    def launch(self, mission_id: str) -> None:
        self._controls[mission_id] = MissionControl()
        self._spawn(self._fly(mission_id))

    def request_return(self, mission_id: str) -> bool:
        control = self._controls.get(mission_id)
        if control is None:
            return False
        control.return_requested = True
        return True

    def charge(self, drone_id: str) -> None:
        self._spawn(self._charge(drone_id))

    async def shutdown(self) -> None:
        for future in list(self._tasks):
            future.cancel()

    def _build_plan(self, mission_id: str) -> tuple[str, MissionPlan] | None:
        settings = get_settings()
        with SessionLocal() as db:
            mission = db.get(m.DroneMission, mission_id)
            if mission is None:
                return None
            drone = mission.drone
            data = mission.flight_data
            speed = (drone.farm.owner.integration_prefs or {}).get("sim_speed", "normal")
            mission.status = "in_progress"
            mission.started_at = datetime.now(UTC)
            drone.status = "in_mission"
            mission.flight_data = {
                **data, "battery_start": drone.battery_level, "battery": drone.battery_level,
                "position": data["home"], "phase": "takeoff",
            }
            db.commit()
            return drone.adapter, MissionPlan(
                mission_id=mission.id,
                route=[tuple(p) for p in data["route"]],
                home=tuple(data["home"]),
                altitude_m=data["altitude_m"],
                speed_mps=CRUISE_SPEED_MPS,
                start_battery=drone.battery_level,
                reserve_pct=RESERVE_PCT,
                photo_count=MAX_SAMPLE_PHOTOS,
                duration_seconds=settings.sim_mission_seconds * SIM_SPEED_FACTOR.get(speed, 1.0)
                * (EMERGENCY_FLIGHT_FACTOR if data.get("emergency_id") else 1.0),
                tick_seconds=settings.sim_tick_seconds,
            )

    def _persist(self, mission_id: str, event: Telemetry, photo_total: int) -> bool:
        """Save one telemetry event. False means the mission vanished (demo reset)."""
        with SessionLocal() as db:
            mission = db.get(m.DroneMission, mission_id)
            if mission is None:
                return False
            data = mission.flight_data
            mission.flight_data = {
                **data,
                "phase": event.phase,
                "progress": round(event.progress, 3),
                "battery": round(event.battery, 1),
                "position": [event.lat, event.lng],
                "track": [*data.get("track", []), [event.lat, event.lng]],
                "photos_taken": photo_total,
                "return_reason": event.return_reason,
            }
            if event.phase in ("returning", "landing"):
                mission.status = "returning"
            mission.drone.battery_level = round(event.battery, 1)
            db.commit()
            return True

    def _finish(self, mission_id: str, event: Telemetry, photos: list[LatLng]) -> None:
        with SessionLocal() as db:
            mission = db.get(m.DroneMission, mission_id)
            if mission is None:
                return
            mission.status = "aborted" if event.return_reason else "completed"
            mission.completed_at = datetime.now(UTC)
            drone = mission.drone
            drone.status = "idle"
            drone.last_mission = mission.id
            drone.last_mission_at = mission.completed_at
            ingest_results(db, mission, photos)
            db.commit()
            log.info("Mission %s finished as %s", mission_id, mission.status)

    def _mark_failed(self, mission_id: str) -> None:
        with SessionLocal() as db:
            mission = db.get(m.DroneMission, mission_id)
            if mission is not None:
                mission.status = "failed"
                mission.completed_at = datetime.now(UTC)
                mission.drone.status = "idle"
                db.commit()

    async def _fly(self, mission_id: str) -> None:
        control = self._controls[mission_id]
        try:
            planned = await asyncio.to_thread(self._build_plan, mission_id)
            if planned is None:
                return
            adapter_id, plan = planned
            adapter = get_drone_adapter(adapter_id)
            photos: list[LatLng] = []
            async for event in adapter.fly(plan, control):
                photos.extend(event.photos)
                alive = await asyncio.to_thread(self._persist, mission_id, event, len(photos))
                if not alive:
                    return
                if event.phase == "landed":
                    await asyncio.to_thread(self._finish, mission_id, event, photos)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Mission %s failed", mission_id)
            await asyncio.to_thread(self._mark_failed, mission_id)
        finally:
            self._controls.pop(mission_id, None)

    def _charge_step(self, drone_id: str) -> bool:
        with SessionLocal() as db:
            drone = db.get(m.Drone, drone_id)
            if drone is None or drone.status != "charging":
                return False
            drone.battery_level = min(100, drone.battery_level + CHARGE_STEP_PCT)
            if drone.battery_level >= 100:
                drone.status = "idle"
            db.commit()
            return drone.status == "charging"

    async def _charge(self, drone_id: str) -> None:
        while await asyncio.to_thread(self._charge_step, drone_id):
            await asyncio.sleep(CHARGE_TICK_SECONDS)


runner = MissionRunner()
