"""Synthetic imagery for the demo: NDVI bands and aerial-looking photos.

Everything here is generated. Callers label it as demo or simulated. The NDVI grid is
still produced by the real ``compute_ndvi`` from separate NIR and RED bands.
"""

import io
import zlib
from datetime import date

import cv2
import numpy as np
from PIL import Image as PILImage
from PIL import ImageDraw

from app.db import models as m
from app.domain.ndvi import compute_ndvi

GRID_ROWS, GRID_COLS = 28, 36
DROPOUT_SHARE = 0.01


def _rng(*parts: object) -> np.random.Generator:
    return np.random.default_rng(zlib.crc32("|".join(map(str, parts)).encode()))


def _smooth_noise(rng: np.random.Generator, shape: tuple[int, int], blur: int) -> np.ndarray:
    noise = cv2.GaussianBlur(rng.normal(size=shape), (0, 0), blur)
    return noise / (np.abs(noise).max() or 1)


def sample_ndvi_grid(field: m.Field, on: date) -> np.ndarray:
    """A demo NDVI raster for a field. Pixels outside its boundary and sensor dropouts are NaN."""
    rng = _rng(field.id, on.isoformat())
    shape = (GRID_ROWS, GRID_COLS)
    polygon = field.coordinates
    lats, lngs = [p[0] for p in polygon], [p[1] for p in polygon]
    lat_max, lat_min, lng_min, lng_max = max(lats), min(lats), min(lngs), max(lngs)

    def to_pixel(lat: float, lng: float) -> tuple[float, float]:
        x = (lng - lng_min) / ((lng_max - lng_min) or 1) * (GRID_COLS - 1)
        y = (lat_max - lat) / ((lat_max - lat_min) or 1) * (GRID_ROWS - 1)
        return x, y

    target = (field.ndvi_mean or 0.5) + _smooth_noise(rng, shape, 3) * 0.07
    yy, xx = np.mgrid[:GRID_ROWS, :GRID_COLS]
    for anomaly in field.anomalies:
        if anomaly.status == "open":
            cx, cy = to_pixel(anomaly.latitude, anomaly.longitude)
            drop = 0.16 if anomaly.severity == "critical" else 0.12
            target -= drop * np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * 3.5**2))
    target = np.clip(target, 0.05, 0.9)

    red = rng.uniform(0.05, 0.12, shape)
    nir = red * (1 + target) / (1 - target)
    dropouts = rng.random(shape) < DROPOUT_SHARE
    nir[dropouts] = 0
    red[dropouts] = 0
    grid = compute_ndvi(nir, red)

    mask = np.zeros(shape, np.uint8)
    points = np.array([to_pixel(*p) for p in polygon], np.int32)
    cv2.fillPoly(mask, [points], 1)
    grid[mask == 0] = np.nan
    return grid


def sample_photo(seed: str, *, green: float = 0.8, yellow: float = 0.1, brown: float = 0.1,
                 label: str = "SIMULATED") -> bytes:
    """A synthetic top-down view of crop rows with stressed patches, stamped as simulated."""
    rng = _rng(seed)
    height, width = 420, 640
    rows = (np.sin(np.linspace(0, 58, height))[:, None] * 0.5 + 0.5) * 0.22 + 0.78
    grain = _smooth_noise(rng, (height, width), 2)

    image = np.zeros((height, width, 3), np.float64)
    image[..., 0] = 62
    image[..., 1] = 128
    image[..., 2] = 48
    total = green + yellow + brown
    for colour, share in (((205, 182, 66), yellow / total), ((128, 84, 46), brown / total)):
        for _ in range(4):
            cx, cy = rng.uniform(0, width), rng.uniform(0, height)
            radius = np.sqrt(share * width * height / 4 / np.pi) * rng.uniform(0.9, 1.3)
            yy, xx = np.mgrid[:height, :width]
            wobble = 1 + 0.25 * _smooth_noise(rng, (height, width), 25)
            inside = ((xx - cx) ** 2 + (yy - cy) ** 2) < (radius * wobble) ** 2
            image[inside] = colour

    image = image * rows[..., None] + grain[..., None] * 18
    picture = PILImage.fromarray(np.clip(image, 0, 255).astype(np.uint8))
    draw = ImageDraw.Draw(picture)
    draw.rectangle((10, 10, 112, 30), fill=(20, 40, 30))
    draw.text((18, 15), label, fill=(255, 255, 255))
    buffer = io.BytesIO()
    picture.save(buffer, "JPEG", quality=82)
    return buffer.getvalue()
