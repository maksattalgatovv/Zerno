"""Transparent, rule-based image check. This is not AI.

It really measures the uploaded photo (colour shares and blotches with OpenCV), then maps
those numbers to a likely issue using fixed rules. It has no knowledge of crop disease, so
confidence is capped and every result is presented as a demo, never as a diagnosis.
"""

import cv2
import numpy as np

from app.adapters.vision.base import Annotation, VisionModel, VisionResult

MAX_SIDE = 640
MAX_CONFIDENCE = 0.6
MIN_PLANT_SHARE = 0.15
ISSUE_SHARE = 0.18
MAX_BOXES = 6


def _hsv_masks(hsv: np.ndarray) -> dict[str, np.ndarray]:
    return {
        "green": cv2.inRange(hsv, np.array([30, 40, 35]), np.array([90, 255, 255])),
        "yellow": cv2.inRange(hsv, np.array([18, 70, 90]), np.array([30, 255, 255])),
        "brown": cv2.inRange(hsv, np.array([5, 50, 30]), np.array([18, 255, 170])),
    }


def _boxes(mask: np.ndarray, label: str, min_area: float) -> list[tuple[float, Annotation]]:
    height, width = mask.shape
    cleaned = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    found = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area >= min_area:
            x, y, w, h = cv2.boundingRect(contour)
            found.append((area, Annotation(x / width, y / height, w / width, h / height, label)))
    return found


def _count_spots(gray: np.ndarray, plant: np.ndarray, frame_area: int) -> int:
    """Small dark blobs surrounded by plant material."""
    kernel = np.ones((15, 15), np.uint8)
    inside = cv2.morphologyEx(plant, cv2.MORPH_CLOSE, kernel)
    dark = cv2.inRange(gray, np.array([0]), np.array([70]))
    candidates = cv2.bitwise_and(dark, inside)
    contours, _ = cv2.findContours(candidates, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    low, high = frame_area * 0.0003, frame_area * 0.01
    return sum(1 for c in contours if low <= cv2.contourArea(c) <= high)


class DemoVisionModel(VisionModel):
    name = "demo-color-rules-v1"
    is_demo = True

    def analyze(self, image_bytes: bytes, crop_type: str) -> VisionResult:
        image = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Image could not be decoded")

        scale = MAX_SIDE / max(image.shape[:2])
        if scale < 1:
            image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

        masks = _hsv_masks(cv2.cvtColor(image, cv2.COLOR_BGR2HSV))
        plant = masks["green"] | masks["yellow"] | masks["brown"]
        frame_area = image.shape[0] * image.shape[1]
        plant_pixels = int(np.count_nonzero(plant))
        plant_share = plant_pixels / frame_area

        shares = {
            name: int(np.count_nonzero(mask)) / max(plant_pixels, 1) for name, mask in masks.items()
        }
        spots = _count_spots(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), plant, frame_area)
        metrics = {
            "plant_pct": round(plant_share * 100, 1),
            "green_pct": round(shares["green"] * 100, 1),
            "yellow_pct": round(shares["yellow"] * 100, 1),
            "brown_pct": round(shares["brown"] * 100, 1),
            "spot_count": spots,
        }

        if plant_share < MIN_PLANT_SHARE:
            return VisionResult(
                issue="inconclusive",
                symptoms=[{"code": "sparse", "coverage_pct": metrics["plant_pct"]}],
                confidence=0.2,
                recommendations=["rec.retake_photo"],
                needs_agronomist=False,
                metrics=metrics,
            )

        symptoms = []
        if shares["yellow"] >= 0.08:
            symptoms.append({"code": "yellowing", "coverage_pct": metrics["yellow_pct"]})
        if shares["brown"] >= 0.08:
            symptoms.append({"code": "browning", "coverage_pct": metrics["brown_pct"]})
        if spots >= 4:
            symptoms.append({"code": "spots", "coverage_pct": spots})

        min_box = frame_area * 0.002
        boxes = _boxes(masks["yellow"], "yellowing", min_box) + _boxes(masks["brown"], "browning", min_box)
        boxes.sort(key=lambda item: item[0], reverse=True)
        annotations = [box for _, box in boxes[:MAX_BOXES]]

        if spots >= 8:
            issue, strength = "leaf_spot", min(spots / 25, 1)
            recs = ["rec.inspect_leaves", "rec.ask_agronomist", "rec.compare_next_flight"]
        elif shares["brown"] >= ISSUE_SHARE and shares["brown"] >= shares["yellow"]:
            issue, strength = "water_stress", min(shares["brown"] / 0.5, 1)
            recs = ["rec.check_soil_moisture", "rec.review_irrigation", "rec.compare_next_flight"]
        elif shares["yellow"] >= ISSUE_SHARE:
            issue, strength = "nutrient_deficiency", min(shares["yellow"] / 0.5, 1)
            recs = ["rec.soil_test", "rec.ask_agronomist", "rec.compare_next_flight"]
        else:
            issue, strength = "no_visible_issue", shares["green"]
            recs = ["rec.keep_monitoring"]
            symptoms = symptoms or [{"code": "healthy_green", "coverage_pct": metrics["green_pct"]}]

        return VisionResult(
            issue=issue,
            symptoms=symptoms,
            confidence=round(min(0.3 + 0.3 * strength, MAX_CONFIDENCE), 2),
            recommendations=recs,
            needs_agronomist=issue in {"leaf_spot", "nutrient_deficiency"},
            annotations=annotations,
            metrics=metrics,
        )
