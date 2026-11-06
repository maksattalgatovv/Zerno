import logging
from functools import lru_cache

from app.adapters.vision.base import VisionModel
from app.adapters.vision.demo import DemoVisionModel
from app.core.config import get_settings

log = logging.getLogger("zerno.vision")


@lru_cache
def get_vision_model() -> VisionModel:
    """Configured model, falling back openly to the labelled demo if it can't load."""
    settings = get_settings()
    if settings.vision_model == "yolo":
        try:
            from app.adapters.vision.yolo import YoloVisionModel

            if settings.yolo_weights_path is None:
                raise FileNotFoundError("YOLO_WEIGHTS_PATH is not set")
            return YoloVisionModel(settings.yolo_weights_path)
        except (ImportError, FileNotFoundError, OSError) as exc:
            log.warning("YOLO model unavailable (%s); using the demo rules instead", exc)
    return DemoVisionModel()
