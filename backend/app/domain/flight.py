"""Mission planning and pre-flight safety rules. Shared by every drone adapter."""

import math
from dataclasses import dataclass

from app.domain.geo import METERS_PER_DEG_LAT, LatLng, lawnmower_route, path_length_m

BATTERY_PCT_PER_KM = 2.2
RESERVE_PCT = 20
MAX_ALTITUDE_M = 120
CRUISE_SPEED_MPS = 10.0
MAX_SAMPLE_PHOTOS = 8
ORBIT_RADIUS_M = 60


@dataclass
class FlightEstimate:
    route: list[LatLng]
    distance_m: float
    duration_min: float
    battery_needed: int


def orbit_route(target: LatLng, radius_m: float = ORBIT_RADIUS_M, points: int = 8) -> list[LatLng]:
    """A small circle around one point: how a drone inspects a location."""
    dlat = radius_m / METERS_PER_DEG_LAT
    dlng = dlat / math.cos(math.radians(target[0]))
    return [
        (target[0] + dlat * math.cos(2 * math.pi * i / points),
         target[1] + dlng * math.sin(2 * math.pi * i / points))
        for i in range(points + 1)
    ]


def estimate_orbit(target: LatLng, home: LatLng, altitude_m: float) -> FlightEstimate:
    route = orbit_route(target)
    distance = path_length_m([home, *route, home])
    return FlightEstimate(
        route=route,
        distance_m=round(distance),
        duration_min=round(distance / CRUISE_SPEED_MPS / 60, 1),
        battery_needed=math.ceil(distance / 1000 * BATTERY_PCT_PER_KM),
    )


def line_spacing_m(altitude_m: float) -> float:
    """Distance between survey lines. A higher camera sees a wider strip."""
    return altitude_m * 1.5


def estimate_flight(polygon: list[LatLng], home: LatLng, altitude_m: float) -> FlightEstimate:
    route = lawnmower_route(polygon, line_spacing_m(altitude_m))
    distance = path_length_m([home, *route, home])
    return FlightEstimate(
        route=route,
        distance_m=round(distance),
        duration_min=round(distance / CRUISE_SPEED_MPS / 60, 1),
        battery_needed=math.ceil(distance / 1000 * BATTERY_PCT_PER_KM),
    )


@dataclass
class PreflightInput:
    connection: str
    gps: str
    battery: float
    status: str
    battery_needed: int
    altitude_m: float


def preflight_checks(data: PreflightInput) -> list[dict]:
    """Every check must pass. They are the same for simulated and real aircraft."""
    needed = data.battery_needed + RESERVE_PCT
    return [
        {"code": "connection", "passed": data.connection == "connected", "params": {}},
        {"code": "gps", "passed": data.gps == "strong", "params": {}},
        {
            "code": "battery",
            "passed": data.battery >= needed,
            "params": {"reserve": RESERVE_PCT, "needed": needed, "battery": round(data.battery)},
        },
        {"code": "available", "passed": data.status == "idle", "params": {}},
        {
            "code": "altitude",
            "passed": 0 < data.altitude_m <= MAX_ALTITUDE_M,
            "params": {"limit": MAX_ALTITUDE_M},
        },
    ]
