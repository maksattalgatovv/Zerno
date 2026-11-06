"""NDVI maths. Requires near-infrared and red bands from multispectral imagery.

NDVI cannot be measured from ordinary RGB photographs, so nothing in this module accepts
RGB images. Callers pass separate NIR and RED reflectance bands.
"""

import numpy as np

HEALTHY_THRESHOLD = 0.6
ATTENTION_THRESHOLD = 0.4


def compute_ndvi(nir: np.ndarray, red: np.ndarray) -> np.ndarray:
    """Per-pixel NDVI = (NIR - RED) / (NIR + RED).

    Pixels with a zero or invalid denominator become NaN instead of raising or being
    reported as a misleading 0.
    """
    nir = np.asarray(nir, dtype=np.float64)
    red = np.asarray(red, dtype=np.float64)
    if nir.shape != red.shape:
        raise ValueError(f"Band shapes differ: {nir.shape} vs {red.shape}")

    denominator = nir + red
    valid = np.isfinite(denominator) & (denominator != 0)
    result = np.full(nir.shape, np.nan)
    result[valid] = (nir[valid] - red[valid]) / denominator[valid]
    return np.clip(result, -1.0, 1.0)


def classify_ndvi(value: float | None) -> str:
    if value is None or not np.isfinite(value):
        return "unknown"
    if value >= HEALTHY_THRESHOLD:
        return "healthy"
    if value >= ATTENTION_THRESHOLD:
        return "attention"
    return "critical"


def summarize_ndvi(grid: np.ndarray) -> dict[str, float]:
    """Mean, range and health shares of the valid pixels. All zeros if none are valid."""
    values = grid[np.isfinite(grid)]
    if values.size == 0:
        return {"mean": 0.0, "minimum": 0.0, "maximum": 0.0,
                "healthy_pct": 0.0, "attention_pct": 0.0, "critical_pct": 0.0}
    total = values.size
    healthy = np.count_nonzero(values >= HEALTHY_THRESHOLD)
    critical = np.count_nonzero(values < ATTENTION_THRESHOLD)
    return {
        "mean": round(float(values.mean()), 3),
        "minimum": round(float(values.min()), 3),
        "maximum": round(float(values.max()), 3),
        "healthy_pct": round(100 * healthy / total, 1),
        "attention_pct": round(100 * (total - healthy - critical) / total, 1),
        "critical_pct": round(100 * critical / total, 1),
    }
