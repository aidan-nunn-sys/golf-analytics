from collections import OrderedDict
from threading import Lock
from time import monotonic, sleep

import httpx

# Nominatim's usage policy requires a descriptive User-Agent that identifies
# the application; anonymous requests are refused.
_USER_AGENT = "golf-analytics/1.0 (self-hosted; contact via repo)"

# Nominatim often matches a course by its POI *node*, whose bounding box is a
# ~45m pinpoint. Overpass only matches a way when one of its own nodes falls
# inside the bbox, so a pinpoint in the middle of the fairways matches nothing.
# ~0.05 deg (~5.5km) comfortably spans a golf course without pulling in a city.
MIN_BBOX_DEGREES = 0.05

_lock = Lock()
_cache: OrderedDict[tuple, tuple[float, list[dict]]] = OrderedDict()
_last_request = 0.0


def _get(base_url: str, params: dict, client: httpx.Client | None = None) -> list[dict]:
    global _last_request
    headers = {"User-Agent": _USER_AGENT}
    if client is not None:
        resp = client.get(base_url, params=params, headers=headers)
        resp.raise_for_status()
        return resp.json()
    # Public Nominatim permits at most one request/second. Cache repeated
    # submitted searches and serialize misses in this single-process app.
    key = (base_url, tuple(sorted(params.items())))
    with _lock:
        cached = _cache.get(key)
        if cached and monotonic() - cached[0] < 300:
            _cache.move_to_end(key)
            return cached[1]
        sleep(max(0, 1 - (monotonic() - _last_request)))
        _last_request = monotonic()
        resp = httpx.get(base_url, params=params, headers=headers, timeout=10)
        resp.raise_for_status()
        results = resp.json()
        _cache[key] = (monotonic(), results)
        _cache.move_to_end(key)
        if len(_cache) > 128:
            _cache.popitem(last=False)
        return results


def geocode(
    query: str, base_url: str
) -> tuple[float, float, float, float] | None:
    """Resolve a free-text place name to a (min_lat, min_lng, max_lat, max_lng) bbox.

    Returns None when nothing matches, so the caller can report "no courses
    found" rather than running an unbounded Overpass query.
    """
    return resolve(query, base_url)[1]


def resolve(
    query: str, base_url: str
) -> tuple[list[dict], tuple[float, float, float, float] | None]:
    """Use golf-course matches directly; other places provide a search bbox."""
    results = _get(base_url, {"q": query, "format": "json", "limit": 5})
    courses = []
    for result in results:
        if (
            result.get("class") != "leisure"
            or result.get("type") != "golf_course"
            or result.get("osm_type") not in ("way", "relation")
        ):
            continue
        courses.append({
            "osm_id": f"{result['osm_type']}/{result['osm_id']}",
            "name": result.get("name") or result["display_name"].split(",")[0],
            "location_lat": float(result["lat"]),
            "location_lng": float(result["lon"]),
            "hole_count": None,
        })
    for result in results:
        bbox = result.get("boundingbox")
        if not bbox or len(bbox) != 4:
            continue
        min_lat, max_lat, min_lng, max_lng = (float(v) for v in bbox)
        min_lat, max_lat = _at_least(min_lat, max_lat, MIN_BBOX_DEGREES)
        min_lng, max_lng = _at_least(min_lng, max_lng, MIN_BBOX_DEGREES)
        return courses, (min_lat, min_lng, max_lat, max_lng)
    return courses, None


def _at_least(low: float, high: float, span: float) -> tuple[float, float]:
    """Widen [low, high] around its centre until it spans at least `span`."""
    if high - low >= span:
        return low, high
    centre = (low + high) / 2
    return centre - span / 2, centre + span / 2
