"""End-to-end API flows against the real database and the running simulator.

Uses unique throwaway accounts and removes them afterwards. The demo account is only read.
"""

import io
import time
import uuid

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import delete

from app.core.config import get_settings
from app.db import models as m
from app.db.session import SessionLocal
from app.main import app
from app.services.sample_data import sample_photo

FIELD = {"name": "Test Field", "region": "Akmola", "area": 40, "crop_type": "wheat",
         "latitude": 51.7, "longitude": 71.1, "planting_date": "2026-05-01"}
FARM = {"name": "Test Farm", "region": "Akmola", "latitude": 51.7, "longitude": 71.1}


@pytest.fixture(scope="module")
def client():
    get_settings().sim_mission_seconds = 2
    get_settings().sim_tick_seconds = 0.05
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def account(client):
    email = f"test-{uuid.uuid4().hex[:10]}@example.com"
    response = client.post("/api/auth/register", json={"name": "Tester", "email": email, "password": "password123"})
    assert response.status_code == 201
    yield {"email": email, "headers": {"Authorization": f"Bearer {response.json()['access_token']}"}}
    with SessionLocal() as db:
        db.execute(delete(m.User).where(m.User.email == email))
        db.commit()


@pytest.fixture()
def farm(client, account):
    response = client.post("/api/farms", json=FARM, headers=account["headers"])
    assert response.status_code == 201
    return response.json()


def _upload(client, headers, data=None):
    data = data or sample_photo("api-test", yellow=0.4, brown=0.05)
    return client.post("/api/images", headers=headers, files={"file": ("crop.jpg", data, "image/jpeg")})


class TestAuth:
    def test_wrong_password_rejected(self, client, account):
        response = client.post("/api/auth/login", json={"email": account["email"], "password": "nope"})
        assert response.status_code == 401
        assert response.json()["code"] == "invalid_credentials"

    def test_error_is_translated(self, client, account):
        response = client.post("/api/auth/login", json={"email": account["email"], "password": "nope"},
                               headers={"Accept-Language": "ru"})
        assert "Неверный" in response.json()["detail"]

    def test_duplicate_email_rejected(self, client, account):
        response = client.post("/api/auth/register", json={"name": "Two", "email": account["email"], "password": "password123"})
        assert response.status_code == 409

    def test_routes_require_a_token(self, client):
        assert client.get("/api/users/me").status_code == 401

    def test_password_reset_flow(self, client, account):
        token = client.post("/api/auth/forgot-password", json={"email": account["email"]}).json()["dev_reset_token"]
        assert client.post("/api/auth/reset-password", json={"token": token, "password": "newpassword1"}).status_code == 204
        assert client.post("/api/auth/login", json={"email": account["email"], "password": "newpassword1"}).status_code == 200
        # Reset links are single-use.
        assert client.post("/api/auth/reset-password", json={"token": token, "password": "another-one"}).status_code == 400

    def test_forgot_password_does_not_reveal_accounts(self, client):
        response = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
        assert response.status_code == 200 and response.json()["dev_reset_token"] is None

    def test_validation_errors_list_fields(self, client):
        response = client.post("/api/auth/register", json={"name": "A", "email": "bad", "password": "x"})
        assert response.status_code == 422
        assert {f["field"] for f in response.json()["fields"]} == {"name", "email", "password"}


class TestDemoAccess:
    def test_demo_login_shows_seeded_farm(self, client):
        token = client.post("/api/auth/demo").json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        farms = client.get("/api/farms", headers=headers).json()
        assert farms[0]["name"] == "ZERNO Demo Farm"
        assert farms[0]["total_area"] == 320  # three crop fields and the pasture
        assert farms[0]["field_count"] >= 3
        dashboard = client.get(f"/api/farms/{farms[0]['id']}/dashboard", headers=headers).json()
        assert dashboard["weather"]["is_demo"] is True
        assert {h["status"] for h in dashboard["health"] if h["fields"]} >= {"healthy", "attention", "critical"}
        assert dashboard["alerts"]

    def test_demo_password_cannot_be_changed(self, client):
        token = client.post("/api/auth/demo").json()["access_token"]
        response = client.post("/api/users/me/password", headers={"Authorization": f"Bearer {token}"},
                               json={"current_password": "x", "new_password": "newpassword1"})
        assert response.status_code == 403


class TestFields:
    def test_create_edit_delete(self, client, account, farm):
        headers = account["headers"]
        created = client.post(f"/api/farms/{farm['id']}/fields", json=FIELD, headers=headers)
        assert created.status_code == 201
        field_id = created.json()["id"]
        assert created.json()["health_status"] == "unknown"
        assert len(created.json()["coordinates"]) == 4

        updated = client.put(f"/api/fields/{field_id}", json={**FIELD, "name": "Renamed"}, headers=headers)
        assert updated.json()["name"] == "Renamed"
        assert client.get(f"/api/farms/{farm['id']}/fields", headers=headers).json()[0]["name"] == "Renamed"

        assert client.delete(f"/api/fields/{field_id}", headers=headers).status_code == 204
        assert client.get(f"/api/farms/{farm['id']}/fields", headers=headers).json() == []

    def test_invalid_area_rejected(self, client, account, farm):
        response = client.post(f"/api/farms/{farm['id']}/fields", json={**FIELD, "area": -1}, headers=account["headers"])
        assert response.status_code == 422

    def test_other_users_cannot_reach_a_field(self, client, account, farm):
        field = client.post(f"/api/farms/{farm['id']}/fields", json=FIELD, headers=account["headers"]).json()
        demo = client.post("/api/auth/demo").json()["access_token"]
        stranger = {"Authorization": f"Bearer {demo}"}
        assert client.get(f"/api/fields/{field['id']}", headers=stranger).status_code == 404
        assert client.delete(f"/api/fields/{field['id']}", headers=stranger).status_code == 404
        assert client.get(f"/api/farms/{farm['id']}/dashboard", headers=stranger).status_code == 404


class TestMissions:
    @pytest.fixture()
    def planned(self, client, account, farm):
        headers = account["headers"]
        field = client.post(f"/api/farms/{farm['id']}/fields", json=FIELD, headers=headers).json()
        drone = client.get(f"/api/farms/{farm['id']}/drones", headers=headers).json()[0]
        mission = client.post("/api/missions", json={"drone_id": drone["id"], "field_id": field["id"]}, headers=headers)
        assert mission.status_code == 201
        return mission.json(), field, drone

    def _wait(self, client, headers, mission_id, timeout=15):
        deadline = time.time() + timeout
        while time.time() < deadline:
            mission = client.get(f"/api/missions/{mission_id}", headers=headers).json()
            if mission["status"] not in ("in_progress", "returning"):
                return mission
            time.sleep(0.05)
        raise AssertionError("Mission did not finish")

    def test_operator_confirmation_is_mandatory(self, client, account, planned):
        response = client.post(f"/api/missions/{planned[0]['id']}/start", json={"operator_confirmed": False}, headers=account["headers"])
        assert response.status_code == 400
        assert response.json()["code"] == "operator_required"

    def test_full_flight_saves_results_and_notifies(self, client, account, planned):
        headers = account["headers"]
        mission, field, drone = planned
        assert all(c["passed"] for c in mission["preflight"])
        assert mission["is_simulated"] is True and mission["route"]

        start = client.post(f"/api/missions/{mission['id']}/start", json={"operator_confirmed": True}, headers=headers)
        assert start.status_code == 200
        again = client.post(f"/api/missions/{mission['id']}/start", json={"operator_confirmed": True}, headers=headers)
        assert again.status_code == 409

        done = self._wait(client, headers, mission["id"])
        assert done["status"] == "completed" and done["progress"] == pytest.approx(1, abs=0.01)
        assert done["images"] and all(i["is_simulated"] for i in done["images"])

        detail = client.get(f"/api/fields/{field['id']}", headers=headers).json()
        assert detail["last_monitored_at"] and detail["health_status"] != "unknown"
        assert detail["zones"] and detail["history"][-1]["source"] == "simulated"

        after = client.get(f"/api/farms/{drone['farm_id']}/drones", headers=headers).json()[0]
        assert after["status"] == "idle" and after["battery_level"] < 100

        titles = [n["title"] for n in client.get("/api/notifications", headers=headers).json()]
        assert "Mission finished" in titles

    def test_return_home_stops_early(self, client, account, planned):
        headers = account["headers"]
        mission = planned[0]
        client.post(f"/api/missions/{mission['id']}/start", json={"operator_confirmed": True}, headers=headers)
        time.sleep(0.3)
        assert client.post(f"/api/missions/{mission['id']}/return-home", headers=headers).status_code == 200
        done = self._wait(client, headers, mission["id"])
        assert done["status"] == "aborted" and done["return_reason"] == "operator"

    def test_low_battery_fails_preflight(self, client, account, planned):
        headers = account["headers"]
        with SessionLocal() as db:
            db.get(m.Drone, planned[2]["id"]).battery_level = 21
            db.commit()
        response = client.post(f"/api/missions/{planned[0]['id']}/start", json={"operator_confirmed": True}, headers=headers)
        assert response.status_code == 409 and response.json()["code"] == "preflight_failed"

    def test_charging_restores_battery(self, client, account, planned):
        headers = account["headers"]
        with SessionLocal() as db:
            db.get(m.Drone, planned[2]["id"]).battery_level = 96
            db.commit()
        assert client.post(f"/api/drones/{planned[2]['id']}/charge", headers=headers).json()["status"] == "charging"
        time.sleep(0.5)
        drone = client.get(f"/api/farms/{planned[2]['farm_id']}/drones", headers=headers).json()[0]
        assert drone["battery_level"] == 100 and drone["status"] == "idle"


class TestAnalysis:
    def test_upload_analyze_decide(self, client, account):
        headers = account["headers"]
        image = _upload(client, headers)
        assert image.status_code == 201

        analysis = client.post("/api/analyses", json={"image_id": image.json()["id"], "crop_type": "wheat"}, headers=headers)
        assert analysis.status_code == 201
        body = analysis.json()
        assert body["is_demo"] is True and "not a diagnosis" in body["disclaimer"]
        assert body["issue_label"] and body["recommendations"] and body["action"] is None

        decided = client.post(f"/api/analyses/{body['id']}/actions", json={"decision": "approved", "comment": "ok"}, headers=headers)
        assert decided.json()["action"]["decision"] == "approved"
        assert client.get(f"/api/analyses/{body['id']}", headers=headers).json()["action"]["comment"] == "ok"
        second = client.post(f"/api/analyses/{body['id']}/actions", json={"decision": "rejected"}, headers=headers)
        assert second.status_code == 409

    def test_analysis_text_follows_language(self, client, account):
        headers = account["headers"]
        image = _upload(client, headers).json()
        created = client.post("/api/analyses", json={"image_id": image["id"], "crop_type": "wheat"}, headers=headers).json()
        russian = client.get(f"/api/analyses/{created['id']}", headers={**headers, "Accept-Language": "ru"}).json()
        assert russian["disclaimer"] != created["disclaimer"]

    def test_non_image_rejected(self, client, account):
        response = _upload(client, account["headers"], b"<script>alert(1)</script>")
        assert response.status_code == 415

    def test_oversized_upload_rejected(self, client, account):
        too_big = b"\xff" * (get_settings().max_upload_mb * 1024 * 1024 + 2)
        assert _upload(client, account["headers"], too_big).status_code == 413

    def test_cannot_analyze_someone_elses_image(self, client, account):
        image = _upload(client, account["headers"]).json()
        demo = client.post("/api/auth/demo").json()["access_token"]
        response = client.post("/api/analyses", json={"image_id": image["id"], "crop_type": "wheat"},
                               headers={"Authorization": f"Bearer {demo}"})
        assert response.status_code == 404


class TestReports:
    def test_all_types_in_all_languages(self, client):
        demo = client.post("/api/auth/demo").json()["access_token"]
        headers = {"Authorization": f"Bearer {demo}"}
        farm = client.get("/api/farms", headers=headers).json()[0]
        field = client.get(f"/api/farms/{farm['id']}/fields", headers=headers).json()[0]
        mission = client.get(f"/api/farms/{farm['id']}/missions", headers=headers).json()[0]
        analysis = client.get("/api/analyses", headers=headers).json()[0]
        bodies = [
            {"type": "crop_health"},
            {"type": "field_monitoring", "field_id": field["id"]},
            {"type": "drone_mission", "mission_id": mission["id"]},
            {"type": "ai_analysis", "analysis_id": analysis["id"]},
        ]
        created = []
        for language in ("en", "ru", "kk"):
            for body in bodies:
                response = client.post("/api/reports", json={**body, "farm_id": farm["id"]},
                                       headers={**headers, "Accept-Language": language})
                assert response.status_code == 201, response.text
                created.append(response.json()["id"])
        download = client.get(f"/api/reports/{created[0]}/download", headers=headers)
        assert download.content[:5] == b"%PDF-"
        assert download.headers["content-type"] == "application/pdf"
        assert client.get(f"/api/reports/{created[0]}/download").status_code == 401
        for report_id in created:
            assert client.delete(f"/api/reports/{report_id}", headers=headers).status_code == 204

    def test_report_needs_a_target(self, client, account, farm):
        response = client.post("/api/reports", json={"type": "field_monitoring", "farm_id": farm["id"]}, headers=account["headers"])
        assert response.status_code == 400


class TestAssistantAndRest:
    def test_chat_is_saved_and_uses_farm_data(self, client):
        demo = client.post("/api/auth/demo").json()["access_token"]
        headers = {"Authorization": f"Bearer {demo}", "Accept-Language": "ru"}
        farm = client.get("/api/farms", headers=headers).json()[0]
        reply = client.post("/api/assistant/messages", json={"farm_id": farm["id"], "content": "Какое поле осмотреть?"}, headers=headers)
        assert reply.status_code == 201
        assert reply.json()["is_demo"] is True and "Восточное поле" in reply.json()["content"]
        messages = client.get("/api/assistant/messages", params={"farm_id": farm["id"]}, headers=headers).json()
        assert [x["role"] for x in messages[-2:]] == ["user", "assistant"]
        assert client.delete("/api/assistant/messages", params={"farm_id": farm["id"]}, headers=headers).status_code == 204

    def test_settings_persist(self, client, account):
        headers = account["headers"]
        client.patch("/api/users/me", json={"language": "kk", "units": "imperial",
                                            "notification_prefs": {"missions": False, "ai": True, "alerts": True}}, headers=headers)
        user = client.get("/api/users/me", headers=headers).json()
        assert user["language"] == "kk" and user["units"] == "imperial"
        assert user["notification_prefs"]["missions"] is False

    def test_disabled_category_creates_no_notification(self, client, account):
        headers = account["headers"]
        client.patch("/api/users/me", json={"notification_prefs": {"missions": True, "ai": False, "alerts": True}}, headers=headers)
        image = _upload(client, headers).json()
        client.post("/api/analyses", json={"image_id": image["id"], "crop_type": "wheat"}, headers=headers)
        assert client.get("/api/notifications", headers=headers).json() == []

    def test_ndvi_grid_is_labelled_and_has_gaps_outside_the_field(self, client):
        demo = client.post("/api/auth/demo").json()["access_token"]
        headers = {"Authorization": f"Bearer {demo}"}
        farm = client.get("/api/farms", headers=headers).json()[0]
        field = client.get(f"/api/farms/{farm['id']}/fields", headers=headers).json()[0]
        grid = client.get(f"/api/fields/{field['id']}/ndvi", headers=headers).json()
        assert grid["is_demo"] is True
        assert any(v is None for row in grid["values"] for v in row)

    def test_system_status_reports_demo_services(self, client, account):
        status = client.get("/api/system/status", headers=account["headers"]).json()
        states = {s["key"]: s["status"] for s in status["services"]}
        assert states["database"] == "ok" and states["drone"] == "demo" and states["weather"] == "demo"

    def test_reset_is_limited_to_demo_account(self, client, account):
        assert client.post("/api/system/demo-reset", headers=account["headers"]).status_code == 403
