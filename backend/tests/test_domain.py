"""Unit tests for critical business logic. None of these need a database."""

import asyncio
import io

import cv2
import numpy as np
import pytest
from PIL import Image

from app.adapters.drone.base import MissionControl, MissionPlan
from app.adapters.drone.simulated import SimulatedDroneAdapter
from app.adapters.llm.demo import DemoAssistant, detect_intent
from app.adapters.storage import LocalStorage
from app.adapters.vision.demo import MAX_CONFIDENCE, DemoVisionModel
from app.core.i18n import LANGUAGES, resolve_lang, t, t_params
from app.core.i18n_catalog import CATALOG
from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.domain.flight import PreflightInput, estimate_flight, preflight_checks
from app.domain.geo import lawnmower_route, path_length_m, polygon_area_ha, rectangle_for_area
from app.domain.ndvi import classify_ndvi, compute_ndvi, summarize_ndvi

SQUARE = rectangle_for_area((51.7, 71.1), 100, aspect=1)


class TestNdvi:
    def test_formula(self):
        result = compute_ndvi(np.array([0.5]), np.array([0.1]))
        assert result[0] == pytest.approx((0.5 - 0.1) / (0.5 + 0.1))

    def test_zero_denominator_is_nan_not_zero(self):
        result = compute_ndvi(np.array([0.0, 0.4]), np.array([0.0, 0.1]))
        assert np.isnan(result[0])
        assert np.isfinite(result[1])

    def test_invalid_values_are_nan(self):
        result = compute_ndvi(np.array([np.nan, np.inf]), np.array([0.1, 0.1]))
        assert np.isnan(result).all()

    def test_opposite_signs_cancelling_denominator(self):
        assert np.isnan(compute_ndvi(np.array([0.2]), np.array([-0.2]))[0])

    def test_shape_mismatch_rejected(self):
        with pytest.raises(ValueError):
            compute_ndvi(np.zeros(3), np.zeros(4))

    def test_result_stays_in_range(self):
        result = compute_ndvi(np.array([1.0, -0.5]), np.array([-0.5, 1.0]))
        assert (result >= -1).all() and (result <= 1).all()

    @pytest.mark.parametrize("value,expected", [
        (0.75, "healthy"), (0.6, "healthy"), (0.59, "attention"), (0.4, "attention"),
        (0.39, "critical"), (None, "unknown"), (float("nan"), "unknown"),
    ])
    def test_classification(self, value, expected):
        assert classify_ndvi(value) == expected

    def test_summary_ignores_nan_and_shares_add_up(self):
        stats = summarize_ndvi(np.array([0.8, 0.5, 0.2, np.nan]))
        assert stats["mean"] == pytest.approx(0.5)
        assert stats["healthy_pct"] + stats["attention_pct"] + stats["critical_pct"] == pytest.approx(100, abs=0.2)

    def test_summary_of_empty_grid(self):
        assert summarize_ndvi(np.array([np.nan]))["mean"] == 0


class TestGeo:
    def test_rectangle_matches_requested_area(self):
        assert polygon_area_ha(rectangle_for_area((51.7, 71.1), 85)) == pytest.approx(85, rel=0.01)

    def test_route_stays_inside_bounds_and_alternates(self):
        route = lawnmower_route(SQUARE, 100)
        lats = [p[0] for p in SQUARE]
        assert all(min(lats) <= p[0] <= max(lats) for p in route)
        assert route[0][1] < route[1][1]  # first line runs east
        assert route[2][1] > route[3][1]  # second line runs back west

    def test_tighter_spacing_means_longer_route(self):
        assert path_length_m(lawnmower_route(SQUARE, 50)) > path_length_m(lawnmower_route(SQUARE, 100))

    def test_route_rejects_bad_input(self):
        with pytest.raises(ValueError):
            lawnmower_route(SQUARE, 0)


class TestFlightSafety:
    def _checks(self, **overrides):
        values = dict(connection="connected", gps="strong", battery=90, status="idle",
                      battery_needed=30, altitude_m=60)
        return {c["code"]: c["passed"] for c in preflight_checks(PreflightInput(**{**values, **overrides}))}

    def test_all_pass_in_good_conditions(self):
        assert all(self._checks().values())

    @pytest.mark.parametrize("override,code", [
        ({"connection": "disconnected"}, "connection"),
        ({"gps": "weak"}, "gps"),
        ({"battery": 49}, "battery"),  # 30 route + 20 reserve
        ({"status": "charging"}, "available"),
        ({"altitude_m": 121}, "altitude"),
    ])
    def test_each_failure_is_caught(self, override, code):
        assert self._checks(**override)[code] is False

    def test_estimate_scales_with_field(self):
        small = estimate_flight(rectangle_for_area((51.7, 71.1), 20), (51.7, 71.1), 60)
        large = estimate_flight(rectangle_for_area((51.7, 71.1), 200), (51.7, 71.1), 60)
        assert large.battery_needed > small.battery_needed > 0


def _fly(control: MissionControl | None = None, on_event=None, battery=100.0):
    route = lawnmower_route(SQUARE, 200)
    plan = MissionPlan("m", route, (51.7, 71.1), 60, 10, battery, 20, 6, 0.3, 0.01)
    control = control or MissionControl()

    async def run():
        events = []
        async for event in SimulatedDroneAdapter().fly(plan, control):
            events.append(event)
            if on_event:
                on_event(event, control)
        return events

    return asyncio.run(run())


class TestSimulatedDrone:
    def test_complete_flight_lands_home_with_photos(self):
        events = _fly()
        last = events[-1]
        assert last.phase == "landed" and last.altitude_m == 0
        assert last.return_reason is None
        assert last.progress == pytest.approx(1, abs=0.01)
        assert (last.lat, last.lng) == (51.7, 71.1)
        assert sum(len(e.photos) for e in events) == 6

    def test_battery_only_goes_down(self):
        levels = [e.battery for e in _fly()]
        assert levels == sorted(levels, reverse=True)
        assert levels[-1] < 100

    def test_operator_return_cuts_mission_short(self):
        def stop_midway(event, control):
            if event.progress > 0.3:
                control.return_requested = True

        last = _fly(on_event=stop_midway)[-1]
        assert last.phase == "landed" and last.return_reason == "operator"
        assert last.progress < 1

    def test_low_battery_forces_return(self):
        last = _fly(battery=20.5)[-1]
        assert last.return_reason == "low_battery"
        assert last.phase == "landed"


def _photo(colour: tuple[int, int, int], patches: list[tuple] = ()) -> bytes:
    image = np.full((200, 300, 3), colour, np.uint8)
    for x, y, w, h, patch_colour in patches:
        cv2.rectangle(image, (x, y), (x + w, y + h), patch_colour, -1)
    buffer = io.BytesIO()
    Image.fromarray(image).save(buffer, "PNG")
    return buffer.getvalue()


class TestDemoVision:
    model = DemoVisionModel()

    def test_green_photo_has_no_issue(self):
        result = self.model.analyze(_photo((60, 140, 50)), "wheat")
        assert result.issue == "no_visible_issue"
        assert result.needs_agronomist is False

    def test_yellowing_flags_nutrients_and_agronomist(self):
        result = self.model.analyze(_photo((60, 140, 50), [(0, 0, 150, 200, (210, 190, 60))]), "wheat")
        assert result.issue == "nutrient_deficiency"
        assert result.needs_agronomist is True
        assert result.annotations

    def test_non_plant_image_is_inconclusive(self):
        result = self.model.analyze(_photo((120, 120, 200)), "wheat")
        assert result.issue == "inconclusive"
        assert result.recommendations == ["rec.retake_photo"]

    def test_confidence_is_capped_because_rules_are_not_a_diagnosis(self):
        result = self.model.analyze(_photo((210, 190, 60)), "wheat")
        assert result.confidence <= MAX_CONFIDENCE
        assert self.model.is_demo is True

    def test_garbage_bytes_raise(self):
        with pytest.raises(ValueError):
            self.model.analyze(b"not an image", "wheat")


class TestDemoAssistant:
    CONTEXT = {
        "farm": {"name": "Test Farm", "total_area": 100, "avg_ndvi": 0.55},
        "weather": {"rain_next_3d_mm": 4},
        "fields": [
            {"name": "Good", "crop": "Wheat", "area": 60, "ndvi": 0.7, "health": "Healthy", "open_anomalies": []},
            {"name": "Bad", "crop": "Wheat", "area": 40, "ndvi": 0.3, "health": "Critical",
             "open_anomalies": ["Possible water stress"]},
        ],
    }

    @pytest.mark.parametrize("question,intent", [
        ("Why are some parts of my wheat field growing poorly?", "poor_growth"),
        ("What does NDVI mean?", "ndvi"),
        ("Which field requires additional inspection?", "inspect"),
        ("How can I reduce unnecessary irrigation?", "irrigation"),
        ("What should I check after detecting crop stress?", "after_stress"),
        ("Как сократить полив?", "irrigation"),
        ("Қай алқапты тексеру керек?", "inspect"),
    ])
    def test_intents(self, question, intent):
        assert detect_intent(question) == intent

    @pytest.mark.parametrize("lang", LANGUAGES)
    def test_answers_use_real_farm_data(self, lang):
        answer = DemoAssistant().reply(self.CONTEXT, [], "Which field requires additional inspection?", lang)
        assert "Bad" in answer and "0.30" in answer

    def test_farm_without_fields(self):
        context = {**self.CONTEXT, "fields": []}
        assert "Test Farm" in DemoAssistant().reply(context, [], "hello", "en")


class TestI18n:
    def test_catalog_is_complete_in_every_language(self):
        for key, entry in CATALOG.items():
            assert set(entry) == set(LANGUAGES), key
            assert all(entry.values()), key

    def test_placeholders_match_across_languages(self):
        import string
        fields = lambda s: {f for _, f, _, _ in string.Formatter().parse(s) if f}
        for key, entry in CATALOG.items():
            assert fields(entry["ru"]) == fields(entry["en"]) == fields(entry["kk"]), key

    def test_literals_pass_through(self):
        assert t("My own field", "ru") == "My own field"

    def test_nested_keys_in_params(self):
        text = t_params("notif.mission_done.msg", "ru", {"field": "field.east", "photos": 3})
        assert "Восточное поле" in text and "3" in text

    @pytest.mark.parametrize("header,expected", [
        ("ru", "ru"), ("kk-KZ,kk;q=0.9", "kk"), ("de,en;q=0.5", "en"), (None, "en"),
    ])
    def test_language_negotiation(self, header, expected):
        assert resolve_lang(header) == expected


class TestSecurity:
    def test_password_round_trip(self):
        hashed = hash_password("пароль-kk-ө")
        assert verify_password("пароль-kk-ө", hashed)
        assert not verify_password("wrong", hashed)

    def test_long_passwords_are_accepted(self):
        assert verify_password("x" * 128, hash_password("x" * 128))

    def test_token_round_trip_and_tampering(self):
        token = create_access_token("user-1")
        assert decode_access_token(token) == "user-1"
        assert decode_access_token(token + "x") is None


class TestStorage:
    def test_rejects_path_traversal(self, tmp_path):
        storage = LocalStorage(tmp_path, "http://x")
        with pytest.raises(ValueError):
            storage.save("../outside.txt", b"nope")

    def test_public_url(self, tmp_path):
        assert LocalStorage(tmp_path, "http://x/").url("public/a/b.jpg") == "http://x/media/a/b.jpg"
