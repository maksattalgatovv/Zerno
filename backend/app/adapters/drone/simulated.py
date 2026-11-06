"""A software-only drone. No radio, no hardware, nothing leaves this process."""

import asyncio
from collections.abc import AsyncIterator

from app.adapters.drone.base import DroneAdapter, MissionControl, MissionPlan, Telemetry
from app.domain.flight import BATTERY_PCT_PER_KM
from app.domain.geo import LatLng, distance_m, path_length_m


def _advance(position: LatLng, target: LatLng, metres: float) -> tuple[LatLng, float]:
    """Move toward target. Returns the new position and the metres left unused."""
    gap = distance_m(position, target)
    if gap <= metres or gap == 0:
        return target, metres - gap
    ratio = metres / gap
    moved = (position[0] + (target[0] - position[0]) * ratio,
             position[1] + (target[1] - position[1]) * ratio)
    return moved, 0.0


class SimulatedDroneAdapter(DroneAdapter):
    adapter_id = "simulated"
    is_simulated = True

    async def fly(self, plan: MissionPlan, control: MissionControl) -> AsyncIterator[Telemetry]:
        survey = plan.route
        survey_length = path_length_m(survey)
        total = path_length_m([plan.home, *survey, plan.home])
        ticks = max(plan.duration_seconds / plan.tick_seconds, 1)
        step = total / ticks

        position = plan.home
        battery = plan.start_battery
        flown = 0.0
        surveyed = 0.0
        altitude = 0.0
        reason: str | None = None
        queue = [*survey]
        photo_spacing = survey_length / max(plan.photo_count, 1)
        next_photo = photo_spacing / 2
        taken = 0

        # Take-off
        for fraction in (0.4, 1.0):
            altitude = plan.altitude_m * fraction
            battery -= 0.2
            yield Telemetry("takeoff", position[0], position[1], altitude, battery, 0, 0)
            await asyncio.sleep(plan.tick_seconds)

        # Survey the route, unless the operator or the battery calls it off.
        started_survey = False
        while queue:
            home_cost = distance_m(position, plan.home) / 1000 * BATTERY_PCT_PER_KM
            if control.return_requested:
                reason = "operator"
            elif battery - home_cost <= plan.reserve_pct / 2:
                reason = "low_battery"
            if reason:
                break

            budget = step
            photos: list[LatLng] = []
            while budget > 0 and queue:
                previous = position
                position, budget = _advance(position, queue[0], budget)
                if position == queue[0]:
                    queue.pop(0)
                moved = distance_m(previous, position)
                flown += moved
                battery -= moved / 1000 * BATTERY_PCT_PER_KM
                if started_survey:
                    surveyed += moved
                    while surveyed >= next_photo and taken < plan.photo_count:
                        photos.append(position)
                        taken += 1
                        next_photo += photo_spacing
                elif position == survey[0]:
                    started_survey = True

            progress = min(surveyed / survey_length, 1.0) if survey_length else 1.0
            yield Telemetry("survey", position[0], position[1], altitude, battery, progress,
                            flown, photos)
            await asyncio.sleep(plan.tick_seconds)

        # Return to home is mandatory in every outcome.
        progress = min(surveyed / survey_length, 1.0) if survey_length else 1.0
        while position != plan.home:
            previous = position
            position, _ = _advance(position, plan.home, step)
            moved = distance_m(previous, position)
            flown += moved
            battery -= moved / 1000 * BATTERY_PCT_PER_KM
            yield Telemetry("returning", position[0], position[1], altitude, battery, progress,
                            flown, return_reason=reason)
            await asyncio.sleep(plan.tick_seconds)

        for fraction in (0.5, 0.0):
            yield Telemetry("landing", position[0], position[1], plan.altitude_m * fraction,
                            battery, progress, flown, return_reason=reason)
            await asyncio.sleep(plan.tick_seconds)

        yield Telemetry("landed", position[0], position[1], 0, battery, progress, flown,
                        return_reason=reason)
