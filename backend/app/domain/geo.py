"""Small geodesy helpers using a local equirectangular projection (fine at field scale)."""

import math

LatLng = tuple[float, float]
METERS_PER_DEG_LAT = 111_320.0


def _meters_per_deg_lng(lat: float) -> float:
    return METERS_PER_DEG_LAT * math.cos(math.radians(lat))


def distance_m(a: LatLng, b: LatLng) -> float:
    mean_lat = (a[0] + b[0]) / 2
    dy = (b[0] - a[0]) * METERS_PER_DEG_LAT
    dx = (b[1] - a[1]) * _meters_per_deg_lng(mean_lat)
    return math.hypot(dx, dy)


def path_length_m(points: list[LatLng]) -> float:
    return sum(distance_m(p, q) for p, q in zip(points, points[1:]))


def centroid(polygon: list[LatLng]) -> LatLng:
    return (sum(p[0] for p in polygon) / len(polygon), sum(p[1] for p in polygon) / len(polygon))


def polygon_area_ha(polygon: list[LatLng]) -> float:
    if len(polygon) < 3:
        return 0.0
    lat0 = centroid(polygon)[0]
    mx = _meters_per_deg_lng(lat0)
    pts = [(p[1] * mx, p[0] * METERS_PER_DEG_LAT) for p in polygon]
    twice_area = sum(
        pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1]
        for i in range(len(pts))
    )
    return abs(twice_area) / 2 / 10_000


def rectangle_for_area(center: LatLng, area_ha: float, aspect: float = 1.25) -> list[LatLng]:
    """A north-aligned rectangle of the given area, used when no boundary was drawn."""
    height = math.sqrt(area_ha * 10_000 / aspect)
    width = height * aspect
    dlat = height / 2 / METERS_PER_DEG_LAT
    dlng = width / 2 / _meters_per_deg_lng(center[0])
    lat, lng = center
    return [
        (lat + dlat, lng - dlng),
        (lat + dlat, lng + dlng),
        (lat - dlat, lng + dlng),
        (lat - dlat, lng - dlng),
    ]


def _scanline_crossings(polygon: list[LatLng], lat: float) -> list[float]:
    crossings = []
    for i, (lat1, lng1) in enumerate(polygon):
        lat2, lng2 = polygon[(i + 1) % len(polygon)]
        if (lat1 <= lat < lat2) or (lat2 <= lat < lat1):
            crossings.append(lng1 + (lat - lat1) / (lat2 - lat1) * (lng2 - lng1))
    return sorted(crossings)


def lawnmower_route(polygon: list[LatLng], spacing_m: float) -> list[LatLng]:
    """Back-and-forth survey lines clipped to the polygon, starting from the north edge."""
    if len(polygon) < 3 or spacing_m <= 0:
        raise ValueError("Route needs a polygon and a positive line spacing")

    lat_min = min(p[0] for p in polygon)
    lat_max = max(p[0] for p in polygon)
    step = spacing_m / METERS_PER_DEG_LAT
    route: list[LatLng] = []
    lat = lat_max - step / 2
    reverse = False
    while lat > lat_min:
        crossings = _scanline_crossings(polygon, lat)
        # Pairs of crossings are the inside spans. Concave shapes give several per line.
        spans = [(crossings[i], crossings[i + 1]) for i in range(0, len(crossings) - 1, 2)]
        if reverse:
            spans = [(b, a) for a, b in reversed(spans)]
        for start, end in spans:
            route.extend([(lat, start), (lat, end)])
        reverse = not reverse
        lat -= step
    return route


def bilinear_quad(quad: list[LatLng], u: float, v: float) -> LatLng:
    """Point inside a quad ordered NW, NE, SE, SW. u runs west to east, v north to south."""
    nw, ne, se, sw = quad
    top = (nw[0] + (ne[0] - nw[0]) * u, nw[1] + (ne[1] - nw[1]) * u)
    bottom = (sw[0] + (se[0] - sw[0]) * u, sw[1] + (se[1] - sw[1]) * u)
    return (top[0] + (bottom[0] - top[0]) * v, top[1] + (bottom[1] - top[1]) * v)


def split_quad(quad: list[LatLng]) -> dict[str, list[LatLng]]:
    """Split a quad into four named quadrants."""
    cells = {"nw": (0, 0), "ne": (0.5, 0), "sw": (0, 0.5), "se": (0.5, 0.5)}
    return {
        name: [
            bilinear_quad(quad, u, v),
            bilinear_quad(quad, u + 0.5, v),
            bilinear_quad(quad, u + 0.5, v + 0.5),
            bilinear_quad(quad, u, v + 0.5),
        ]
        for name, (u, v) in cells.items()
    }
