"""The contract every drone integration implements.

Application code only talks to this interface. The mission runner consumes the telemetry
stream, so adding a manufacturer means writing one adapter and registering it.
"""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

from app.domain.geo import LatLng


@dataclass
class MissionPlan:
    mission_id: str
    route: list[LatLng]
    home: LatLng
    altitude_m: float
    speed_mps: float
    start_battery: float
    reserve_pct: float
    photo_count: int
    duration_seconds: float  # simulated wall-clock duration
    tick_seconds: float


@dataclass
class MissionControl:
    """Shared with the running flight so the operator can intervene at any moment."""

    return_requested: bool = False


@dataclass
class Telemetry:
    phase: str  # takeoff|survey|returning|landing|landed
    lat: float
    lng: float
    altitude_m: float
    battery: float
    progress: float  # 0..1 share of the survey route
    distance_flown_m: float
    photos: list[LatLng] = field(default_factory=list)  # captured since the last event
    return_reason: str | None = None  # operator|low_battery


class DroneAdapter(ABC):
    adapter_id: str
    is_simulated: bool
    available: bool = True

    @abstractmethod
    def fly(self, plan: MissionPlan, control: MissionControl) -> AsyncIterator[Telemetry]:
        """Execute the plan and yield telemetry until the drone has landed."""
