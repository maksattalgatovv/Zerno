"""Real detector integration through ultralytics YOLO + PyTorch.

Requires ``pip install -r requirements-ai.txt`` and weights trained on crop symptoms, with
class names matching CLASS_TO_ISSUE. Generic COCO weights can't detect crop problems.
"""

import io
from pathlib import Path

from PIL import Image

from app.adapters.vision.base import Annotation, VisionModel, VisionResult

CLASS_TO_ISSUE = {
    "leaf_spot": ("leaf_spot", "spots", ["rec.inspect_leaves", "rec.ask_agronomist"]),
    "chlorosis": ("nutrient_deficiency", "yellowing", ["rec.soil_test", "rec.ask_agronomist"]),
    "drought": ("water_stress", "browning", ["rec.check_soil_moisture", "rec.review_irrigation"]),
}


class YoloVisionModel(VisionModel):
    is_demo = False

    def __init__(self, weights: Path) -> None:
        from ultralytics import YOLO  # heavy optional dependency, imported on demand

        self.model = YOLO(str(weights))
        self.name = f"yolo:{weights.stem}"

    def analyze(self, image_bytes: bytes, crop_type: str) -> VisionResult:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        prediction = self.model.predict(image, verbose=False)[0]
        width, height = image.size

        annotations, scores, totals = [], {}, {}
        for box in prediction.boxes:
            class_name = prediction.names[int(box.cls)]
            if class_name not in CLASS_TO_ISSUE:
                continue
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            symptom = CLASS_TO_ISSUE[class_name][1]
            annotations.append(
                Annotation(x1 / width, y1 / height, (x2 - x1) / width, (y2 - y1) / height, symptom)
            )
            scores[class_name] = max(scores.get(class_name, 0), float(box.conf))
            totals[class_name] = totals.get(class_name, 0) + 1

        if not scores:
            return VisionResult("no_visible_issue", [], 0.5, ["rec.keep_monitoring"], False)

        top = max(scores, key=scores.get)
        issue, _, recs = CLASS_TO_ISSUE[top]
        symptoms = [{"code": CLASS_TO_ISSUE[c][1], "coverage_pct": n} for c, n in totals.items()]
        return VisionResult(issue, symptoms, round(scores[top], 2), recs, True, annotations)
