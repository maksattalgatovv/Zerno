"""Placeholder for a real DJI integration. Deliberately not implemented.

Before this adapter may fly anything it must have:
  * legal authorization for the flight in the operating country,
  * the manufacturer's SDK and its own geofencing and failsafe behaviour,
  * a licensed operator supervising the aircraft, able to take control at any time.

``available = False`` keeps it out of mission planning until then.
"""

from collections.abc import AsyncIterator

from app.adapters.drone.base import DroneAdapter, MissionControl, MissionPlan, Telemetry


class DjiDroneAdapter(DroneAdapter):
    adapter_id = "dji"
    is_simulated = False
    available = False

    def fly(self, plan: MissionPlan, control: MissionControl) -> AsyncIterator[Telemetry]:
        raise NotImplementedError("Real flight execution is not part of this MVP")
