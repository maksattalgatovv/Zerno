"""Livestock head counts.

Drones count the animals on each pasture. Births, purchases, sales and deaths are entered by
hand, because a drone can see how many animals there are but not why the number changed.
Every change is an event, so the current number can always be explained.
"""

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.core.errors import ApiError
from app.core.i18n import t
from app.db import models as m
from app.services.notifications import notify
from app.services.sample_data import _rng

RECENT_EVENTS = 15
# Fixed order, so the summary doesn't jump around as counts change.
SPECIES_ORDER = ["cattle", "sheep", "goat", "horse", "camel", "poultry", "other"]
SIGN = {"birth": 1, "purchase": 1, "sale": -1, "death": -1}
# Animals stand close together, hide under trees or walk out of frame. Small flocks are easier.
SIM_MISS_RATE = 0.012


def apply_event(group: m.LivestockGroup, kind: str, quantity: int, note: str = "", *,
                mission_id: str | None = None, confidence: float | None = None,
                is_simulated: bool = False) -> m.LivestockEvent:
    """Changes the head count and records why. Refuses changes that would leave a negative count."""
    current = group.head_count or 0  # None until a new group is flushed
    if kind in ("recount", "drone_count"):
        new_count = quantity
    else:
        if quantity == 0:
            raise ApiError(422, "livestock_zero_quantity")
        new_count = current + SIGN[kind] * quantity
        if new_count < 0:
            raise ApiError(409, "livestock_not_enough", available=current)
    event = m.LivestockEvent(
        kind=kind, change=new_count - current, count_after=new_count, note=note,
        mission_id=mission_id, confidence=confidence, is_simulated=is_simulated,
    )
    group.events.append(event)
    group.head_count = new_count
    group.updated_at = m.utcnow()
    return event


def simulated_count(expected: int, seed: str) -> tuple[int, float]:
    """What a counting model might report from aerial photos. A stand-in until a trained
    livestock detector is connected: usually exact, sometimes off by a few animals."""
    rng = _rng(seed, "livestock")
    spread = max(1, round(expected * SIM_MISS_RATE))
    roll = rng.random()
    if roll < 0.55 or expected == 0:
        error = 0
    elif roll < 0.85:
        error = -int(rng.integers(1, spread + 1))  # some animals hidden
    else:
        error = int(rng.integers(1, spread + 1))  # strays from a neighbour, or counted twice
    confidence = round(float(rng.uniform(0.86, 0.97)) - (0.04 if expected > 200 else 0), 2)
    return max(0, expected + error), confidence


def count_from_flight(db: Session, mission: m.DroneMission, owner: m.User) -> list[dict]:
    """Record what a completed counting flight saw, and warn the farmer about differences."""
    field = mission.field
    simulated = bool(mission.flight_data.get("simulated", True))
    groups = db.scalars(
        select(m.LivestockGroup).where(m.LivestockGroup.field_id == field.id).order_by(m.LivestockGroup.created_at)
    ).all()
    results = []
    for group in groups:
        expected = group.head_count
        counted, confidence = simulated_count(expected, f"{mission.id}-{group.id}")
        apply_event(group, "drone_count", counted, mission_id=mission.id, confidence=confidence,
                    is_simulated=simulated)
        results.append({"group_id": group.id, "group_name": group.name, "species": group.species,
                        "expected": expected, "counted": counted, "confidence": confidence})

    difference = sum(r["counted"] - r["expected"] for r in results)
    total = sum(r["counted"] for r in results)
    if any(r["counted"] != r["expected"] for r in results):
        notify(db, owner, "alerts", "notif.livestock_diff.title", "notif.livestock_diff.msg", severity="warning",
               link="/livestock", params={"field": field.name, "total": total, "diff": f"{difference:+d}"})
    else:
        notify(db, owner, "missions", "notif.livestock_done.title", "notif.livestock_done.msg", severity="success",
               link="/livestock", params={"field": field.name, "total": total})
    return results


def create_group(db: Session, farm: m.Farm, body: schemas.LivestockGroupIn) -> m.LivestockGroup:
    group = m.LivestockGroup(farm_id=farm.id, field_id=body.field_id, species=body.species,
                             name=body.name.strip(), notes=body.notes.strip(), head_count=0)
    db.add(group)
    if body.head_count:
        apply_event(group, "recount", body.head_count)
    db.commit()
    return group


def _last_drone_count(group: m.LivestockGroup) -> schemas.DroneCountOut | None:
    event = next((e for e in reversed(group.events) if e.kind == "drone_count"), None)
    if event is None:
        return None
    return schemas.DroneCountOut(counted=event.count_after, confidence=event.confidence,
                                 mission_id=event.mission_id, is_simulated=event.is_simulated,
                                 at=event.created_at)


def group_out(group: m.LivestockGroup, lang: str) -> schemas.LivestockGroupOut:
    return schemas.LivestockGroupOut(
        id=group.id, species=group.species, name=t(group.name, lang), head_count=group.head_count,
        notes=group.notes, field_id=group.field_id, field_name=t(group.field.name, lang) if group.field else None,
        last_drone_count=_last_drone_count(group), updated_at=group.updated_at,
    )


def event_out(event: m.LivestockEvent, lang: str) -> schemas.LivestockEventOut:
    return schemas.LivestockEventOut(
        id=event.id, group_id=event.group_id, group_name=t(event.group.name, lang),
        species=event.group.species, kind=event.kind, change=event.change,
        count_after=event.count_after, note=event.note, mission_id=event.mission_id,
        confidence=event.confidence, is_simulated=event.is_simulated, created_at=event.created_at,
    )


def summary(db: Session, farm: m.Farm, lang: str) -> schemas.LivestockOut:
    groups = db.scalars(
        select(m.LivestockGroup).where(m.LivestockGroup.farm_id == farm.id)
        .order_by(m.LivestockGroup.created_at)
    ).all()
    counts: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for group in groups:
        counts[group.species][0] += group.head_count
        counts[group.species][1] += 1
    events = db.scalars(
        select(m.LivestockEvent).join(m.LivestockGroup)
        .where(m.LivestockGroup.farm_id == farm.id)
        .order_by(m.LivestockEvent.created_at.desc()).limit(RECENT_EVENTS)
    ).all()
    return schemas.LivestockOut(
        total=sum(g.head_count for g in groups),
        by_species=[
            schemas.SpeciesCount(species=s, head_count=counts[s][0], groups=counts[s][1])
            for s in SPECIES_ORDER if s in counts
        ],
        groups=[group_out(g, lang) for g in groups],
        recent_events=[event_out(e, lang) for e in events],
    )
