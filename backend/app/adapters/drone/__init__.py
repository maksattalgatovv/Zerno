from app.adapters.drone.base import DroneAdapter
from app.adapters.drone.dji import DjiDroneAdapter
from app.adapters.drone.simulated import SimulatedDroneAdapter

_ADAPTERS: dict[str, DroneAdapter] = {
    adapter.adapter_id: adapter for adapter in (SimulatedDroneAdapter(), DjiDroneAdapter())
}


def get_drone_adapter(adapter_id: str) -> DroneAdapter | None:
    return _ADAPTERS.get(adapter_id)
