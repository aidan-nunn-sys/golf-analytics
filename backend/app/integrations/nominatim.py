import httpx

# Nominatim's usage policy requires a descriptive User-Agent that identifies
# the application; anonymous requests are refused.
_USER_AGENT = "golf-analytics/1.0 (self-hosted; contact via repo)"

# Nominatim often matches a course by its POI *node*, whose bounding box is a
# ~45m pinpoint. Overpass only matches a way when one of its own nodes falls
# inside the bbox, so a pinpoint in the middle of the fairways matches nothing.
# ~0.05 deg (~5.5km) comfortably spans a golf course without pulling in a city.
MIN_BBOX_DEGREES = 0.05


def _get(base_url: str, params: dict, client: httpx.Client | None = None) -> list[dict]:
    headers = {"User-Agent": _USER_AGENT}
    if client is not None:
        resp = client.get(base_url, params=params, headers=headers)
    else:
        resp = httpx.get(base_url, params=params, headers=headers, timeout=10)
    resp.raise_for_status()
    return resp.json()


def geocode(
    query: str, base_url: str
) -> tuple[float, float, float, float] | None:
    """Resolve a free-text place name to a (min_lat, min_lng, max_lat, max_lng) bbox.

    Returns None when nothing matches, so the caller can report "no courses
    found" rather than running an unbounded Overpass query.
    """
    results = _get(base_url, {"q": query, "format": "json", "limit": 1})
    for result in results:
        bbox = result.get("boundingbox")
        if not bbox or len(bbox) != 4:
            continue
        min_lat, max_lat, min_lng, max_lng = (float(v) for v in bbox)
        min_lat, max_lat = _at_least(min_lat, max_lat, MIN_BBOX_DEGREES)
        min_lng, max_lng = _at_least(min_lng, max_lng, MIN_BBOX_DEGREES)
        return min_lat, min_lng, max_lat, max_lng
    return None


def _at_least(low: float, high: float, span: float) -> tuple[float, float]:
    """Widen [low, high] around its centre until it spans at least `span`."""
    if high - low >= span:
        return low, high
    centre = (low + high) / 2
    return centre - span / 2, centre + span / 2
