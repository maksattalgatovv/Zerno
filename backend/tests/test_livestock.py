"""Livestock counting against the real database."""

import time
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.core.config import get_settings
from app.db import models as m
from app.db.session import SessionLocal
from app.main import app


PASTURE = {"name": "Pasture", "region": "Akmola", "area": 30, "crop_type": "pasture",
           "latitude": 51.7, "longitude": 71.1}


@pytest.fixture(scope="module")
def client():
    get_settings().sim_mission_seconds = 1
    get_settings().sim_tick_seconds = 0.05
    with TestClient(app) as test_client:
        yield test_client


def _account(client):
    email = f"test-{uuid.uuid4().hex[:10]}@example.com"
    token = client.post("/api/auth/register", json={"name": "Tester", "email": email, "password": "password123"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    farm = client.post("/api/farms", json={"name": "Farm", "region": "Akmola"}, headers=headers).json()
    pasture = client.post(f"/api/farms/{farm['id']}/fields", json=PASTURE, headers=headers).json()
    return email, {"headers": headers, "id": farm["id"], "pasture_id": pasture["id"]}


@pytest.fixture()
def farm(client):
    email, data = _account(client)
    yield data
    with SessionLocal() as db:
        db.execute(delete(m.User).where(m.User.email == email))
        db.commit()


def _group(client, farm, **overrides):
    body = {"species": "sheep", "name": "Flock", "head_count": 100, **overrides}
    response = client.post(f"/api/farms/{farm['id']}/livestock", json=body, headers=farm["headers"])
    assert response.status_code == 201, response.text
    return response.json()


def _event(client, farm, group_id, kind, quantity):
    return client.post(f"/api/livestock/{group_id}/events", json={"kind": kind, "quantity": quantity},
                       headers=farm["headers"])


def _summary(client, farm):
    return client.get(f"/api/farms/{farm['id']}/livestock", headers=farm["headers"]).json()


def test_events_change_the_count_and_explain_it(client, farm):
    group = _group(client, farm)
    assert _event(client, farm, group["id"], "birth", 12).json()["count_after"] == 112
    assert _event(client, farm, group["id"], "sale", 30).json()["count_after"] == 82
    recount = _event(client, farm, group["id"], "recount", 80).json()
    assert recount["change"] == -2 and recount["count_after"] == 80

    summary = _summary(client, farm)
    assert summary["total"] == 80
    assert [e["kind"] for e in summary["recent_events"]] == ["recount", "sale", "birth", "recount"]
    assert sum(e["change"] for e in summary["recent_events"]) == 80


def test_totals_by_species_and_on_dashboard(client, farm):
    _group(client, farm, species="cattle", head_count=40)
    _group(client, farm, species="cattle", head_count=10)
    _group(client, farm, species="horse", head_count=7)
    summary = _summary(client, farm)
    assert summary["total"] == 57
    assert summary["by_species"] == [
        {"species": "cattle", "head_count": 50, "groups": 2},
        {"species": "horse", "head_count": 7, "groups": 1},
    ]
    dashboard = client.get(f"/api/farms/{farm['id']}/dashboard", headers=farm["headers"]).json()
    assert dashboard["stats"]["livestock_total"] == 57


def test_count_never_goes_negative(client, farm):
    group = _group(client, farm, head_count=5)
    response = _event(client, farm, group["id"], "death", 6)
    assert response.status_code == 409
    assert response.json()["code"] == "livestock_not_enough"
    assert _event(client, farm, group["id"], "sale", 0).status_code == 422
    assert _summary(client, farm)["total"] == 5


def test_editing_keeps_the_count(client, farm):
    group = _group(client, farm)
    response = client.patch(f"/api/livestock/{group['id']}", json={"name": "Summer pasture"}, headers=farm["headers"])
    assert response.json()["name"] == "Summer pasture"
    assert response.json()["head_count"] == 100


def test_other_users_cannot_see_or_change_groups(client, farm):
    group = _group(client, farm)
    email, stranger = _account(client)
    try:
        assert _event(client, stranger, group["id"], "sale", 1).status_code == 404
        assert client.delete(f"/api/livestock/{group['id']}", headers=stranger["headers"]).status_code == 404
        assert client.get(f"/api/farms/{farm['id']}/livestock", headers=stranger["headers"]).status_code == 404
    finally:
        with SessionLocal() as db:
            db.execute(delete(m.User).where(m.User.email == email))
            db.commit()


def test_deleting_a_group_removes_it_from_the_total(client, farm):
    group = _group(client, farm)
    assert client.delete(f"/api/livestock/{group['id']}", headers=farm["headers"]).status_code == 204
    assert _summary(client, farm)["total"] == 0


def _fly(client, farm, purpose="livestock"):
    drone = client.get(f"/api/farms/{farm['id']}/drones", headers=farm["headers"]).json()[0]
    planned = client.post("/api/missions", json={"drone_id": drone["id"], "field_id": farm["pasture_id"],
                                                 "purpose": purpose}, headers=farm["headers"])
    if planned.status_code != 201:
        return planned
    mission_id = planned.json()["id"]
    started = client.post(f"/api/missions/{mission_id}/start", json={"operator_confirmed": True}, headers=farm["headers"])
    assert started.status_code == 200, started.text
    deadline = time.time() + 15
    while time.time() < deadline:
        mission = client.get(f"/api/missions/{mission_id}", headers=farm["headers"]).json()
        if mission["status"] not in ("in_progress", "returning"):
            return mission
        time.sleep(0.05)
    raise AssertionError("Mission did not finish")


def test_counting_flight_needs_animals_on_the_field(client, farm):
    _group(client, farm)  # not assigned to the pasture
    response = _fly(client, farm)
    assert response.status_code == 409
    assert response.json()["code"] == "no_livestock_on_field"


def test_drone_count_is_recorded_for_each_group_on_the_pasture(client, farm):
    sheep = _group(client, farm, field_id=farm["pasture_id"], head_count=200)
    cows = _group(client, farm, species="cattle", field_id=farm["pasture_id"], head_count=40)
    indoors = _group(client, farm, species="poultry", head_count=500)

    mission = _fly(client, farm)
    assert mission["status"] == "completed" and mission["purpose"] == "livestock"
    counts = {c["group_id"]: c for c in mission["livestock_counts"]}
    assert set(counts) == {sheep["id"], cows["id"]}
    assert counts[sheep["id"]]["expected"] == 200
    assert abs(counts[sheep["id"]]["counted"] - 200) <= 3
    assert 0 < counts[sheep["id"]]["confidence"] < 1

    summary = _summary(client, farm)
    groups = {g["id"]: g for g in summary["groups"]}
    assert groups[sheep["id"]]["head_count"] == counts[sheep["id"]]["counted"]
    assert groups[sheep["id"]]["last_drone_count"]["mission_id"] == mission["id"]
    assert groups[sheep["id"]]["field_name"] == "Pasture"
    assert groups[indoors["id"]]["head_count"] == 500
    assert groups[indoors["id"]]["last_drone_count"] is None
    drone_events = [e for e in summary["recent_events"] if e["kind"] == "drone_count"]
    assert len(drone_events) == 2 and all(e["is_simulated"] for e in drone_events)


def test_a_survey_flight_does_not_change_the_count(client, farm):
    group = _group(client, farm, field_id=farm["pasture_id"])
    mission = _fly(client, farm, purpose="survey")
    assert mission["livestock_counts"] == []
    assert _summary(client, farm)["groups"][0]["head_count"] == group["head_count"]


def test_drone_counts_cannot_be_entered_by_hand(client, farm):
    group = _group(client, farm)
    assert _event(client, farm, group["id"], "drone_count", 5).status_code == 422


def test_pasture_must_belong_to_the_same_farm(client, farm):
    email, other = _account(client)
    try:
        body = {"species": "sheep", "name": "Flock", "field_id": other["pasture_id"]}
        response = client.post(f"/api/farms/{farm['id']}/livestock", json=body, headers=farm["headers"])
        assert response.status_code == 404
    finally:
        with SessionLocal() as db:
            db.execute(delete(m.User).where(m.User.email == email))
            db.commit()
