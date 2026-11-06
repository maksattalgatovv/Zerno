"""The contract for crop-image analysis models."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class Annotation:
    # Normalised to 0..1 so they stay valid at any display size.
    x: float
    y: float
    w: float
    h: float
    label: str  # symptom code


@dataclass
class VisionResult:
    issue: str  # code, see issue.* in the i18n catalog
    symptoms: list[dict]  # {"code": str, "coverage_pct": float}
    confidence: float  # 0..1
    recommendations: list[str]  # rec.* keys
    needs_agronomist: bool
    annotations: list[Annotation] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)


class VisionModel(ABC):
    name: str
    is_demo: bool

    @abstractmethod
    def analyze(self, image_bytes: bytes, crop_type: str) -> VisionResult:
        """Analyse one image. Raises ValueError if the image can't be decoded."""
