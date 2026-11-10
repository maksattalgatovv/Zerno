"""Emergency flows against the real database and simulator."""

import time
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.core.config import get_settings
from app.db import models as m
from app.db.session import SessionLocal
from app.domain.flight import estimate_orbit, orbit_route
from app.domain.geo import distance_m
from app.main import app

FIELD = {"name": "Test Field", "region": "Akmola", "area": 40, "crop_type": "wheat",
         "latitude": 51.7, "longitude": 71.1}


def test_orbit_circles_the_target():
    target = (51.7, 71.1)
    assert all(abs(distance_m(target, p) - 60) < 1 for p in orbit_route(target))


def test_orbit_estimate_costs_battery():
    assert estimate_orbit((51.7, 71.1), (51.71, 71.1), 60).battery_needed > 0


@pytest.fixture(scope="module")
def client():
    get_settings().sim_mission_seconds = 1
    get_settings().sim_tick_seconds = 0.05
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def farm(client):
    email = f"test-{uuid.uuid4().hex[:10]}@example.com"
    token = client.post("/api/auth/register", json={"name": "Tester", "email": email, "password": "password123"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    farm = client.post("/api/farms", json={"name": "Farm", "region": "Akmola", "latitude": 51.7, "longitude": 71.1}, headers=headers).json()
    field = client.post(f"/api/farms/{farm['id']}/fields", json=FIELD, headers=headers).json()
    yield {"headers": headers, "id": farm["id"], "field_id": field["id"]}
    with SessionLocal() as db:
        db.execute(delete(m.User).where(m.User.email == email))
        db.commit()


def _raise(client, farm, **overrides):
    body = {"farm_id": farm["id"], "type": "fire", "field_id": farm["field_id"], "send_drone": True, **overrides}
    return client.post("/api/emergencies", json=body, headers=farm["headers"])


def _codes(emergency):
    return [entry["code"] for entry in emergency["log"]]


def _wait_for_code(client, farm, code):
    deadline = time.time() + 15
    while time.time() < deadline:
        emergency = client.get(f"/api/farms/{farm['id']}/emergencies", headers=farm["headers"]).json()[0]
        if code in _codes(emergency):
            return emergency
        time.sleep(0.05)
    raise AssertionError(f"{code} never logged")


def test_alarm_acts_immediately(client, farm):
    response = _raise(client, farm)
    assert response.status_code == 201
    emergency = response.json()
    assert emergency["status"] == "active" and emergency["mission_id"]
    assert {"created", "mapped", "notified", "drone_recon"} <= set(_codes(emergency))

    health = client.get(f"/api/fields/{farm['field_id']}", headers=farm["headers"]).json()
    assert any(a["type"] == "fire" and a["status"] == "open" for a in health["anomalies"])
    alerts = client.get("/api/notifications", headers=farm["headers"]).json()
    assert alerts[0]["severity"] == "critical" and "Fire" in alerts[0]["message"]


def test_finished_flight_reports_but_never_closes(client, farm):
    _raise(client, farm)
    emergency = _wait_for_code(client, farm, "recon_done")
    assert emergency["status"] == "active"


def test_water_drop_tells_the_farmer_to_check(client, farm):
    created = _raise(client, farm, send_drone=False).json()
    sent = client.post(f"/api/emergencies/{created['id']}/drone", json={"mode": "suppress"}, headers=farm["headers"])
    assert "drone_suppress" in _codes(sent.json())
    emergency = _wait_for_code(client, farm, "suppress_done")
    assert emergency["status"] == "active"


def test_alarm_stands_when_no_drone_can_fly(client, farm):
    with SessionLocal() as db:
        for drone in db.get(m.Farm, farm["id"]).drones:
            drone.battery_level = 5
        db.commit()
    emergency = _raise(client, farm).json()
    assert emergency["status"] == "active" and emergency["mission_id"] is None
    assert "no_drone" in _codes(emergency) and "notified" in _codes(emergency)


def test_alarm_ignores_notification_preferences(client, farm):
    client.patch("/api/users/me", headers=farm["headers"],
                 json={"notification_prefs": {"missions": False, "ai": False, "alerts": False}})
    _raise(client, farm, send_drone=False)
    assert client.get("/api/notifications", headers=farm["headers"]).json()


def test_without_a_field_the_alarm_uses_the_farm_location(client, farm):
    emergency = _raise(client, farm, field_id=None).json()
    assert emergency["latitude"] == 51.7 and "no_field" in _codes(emergency)


def test_resolve_clears_the_map_and_closes_for_good(client, farm):
    created = _raise(client, farm, send_drone=False).json()
    resolved = client.post(f"/api/emergencies/{created['id']}/resolve", headers=farm["headers"]).json()
    assert resolved["status"] == "resolved" and resolved["resolved_at"]
    detail = client.get(f"/api/fields/{farm['field_id']}", headers=farm["headers"]).json()
    assert all(a["status"] == "resolved" for a in detail["anomalies"])
    again = client.post(f"/api/emergencies/{created['id']}/resolve", headers=farm["headers"])
    assert again.status_code == 409


def test_device_events_join_the_timeline_in_any_language(client, farm):
    created = _raise(client, farm, send_drone=False).json()
    updated = client.post(f"/api/emergencies/{created['id']}/events", json={"code": "call", "detail": "101"},
                          headers={**farm["headers"], "Accept-Language": "ru"}).json()
    assert "101" in updated["log"][-1]["text"] and "звонок" in updated["log"][-1]["text"]


def test_contacts_are_saved_and_validated(client, farm):
    good = client.patch("/api/users/me", headers=farm["headers"],
                        json={"emergency_contacts": [{"name": "Neighbour", "phone": "+7 701 000 00 00"}]})
    assert good.json()["emergency_contacts"][0]["name"] == "Neighbour"
    bad = client.patch("/api/users/me", headers=farm["headers"],
                       json={"emergency_contacts": [{"name": "X", "phone": "call me"}]})
    assert bad.status_code == 422


def test_other_users_cannot_touch_an_emergency(client, farm):
    created = _raise(client, farm, send_drone=False).json()
    demo = client.post("/api/auth/demo").json()["access_token"]
    stranger = {"Authorization": f"Bearer {demo}"}
    assert client.post(f"/api/emergencies/{created['id']}/resolve", headers=stranger).status_code == 404
    assert client.get(f"/api/farms/{farm['id']}/emergencies", headers=stranger).status_code == 404
