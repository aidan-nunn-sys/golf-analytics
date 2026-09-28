import httpx


def _post(base_url: str, query: str) -> dict:
    # A descriptive User-Agent is required: overpass-api.de's front end returns
    # 406 Not Acceptable for requests using httpx's default UA string.
    resp = httpx.post(
        base_url,
        data={"data": query},
        timeout=30,
        headers={"User-Agent": "golf-analytics/1.0 (self-hosted; contact via repo)"},
    )
    resp.raise_for_status()
    return resp.json()


def _centroid(geometry: list[dict]) -> tuple[float, float]:
    lats = [p["lat"] for p in geometry]
    lngs = [p["lon"] for p in geometry]
    return sum(lats) / len(lats), sum(lngs) / len(lngs)


def search_courses(
    query: str, base_url: str, bbox: tuple[float, float, float, float] | None = None
) -> list[dict]:
    # ponytail: bbox is optional (frontend map viewport isn't built yet). An
    # unbounded name-only query times out against the public Overpass instance
    # (confirmed 2026-07-13); bbox-filtered queries succeed in ~1.6s. Wire this
    # up from the map viewport when the frontend pillar lands.
    bbox_filter = f"({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]})" if bbox else ""
    # Escape backslash/quote so a `"` in the search string can't break out of
    # the QL string literal and inject arbitrary Overpass QL.
    escaped_query = query.replace("\\", "\\\\").replace('"', '\\"')
    ql = f"""
    [out:json][timeout:25];
    nwr["leisure"="golf_course"]["name"~"{escaped_query}",i]{bbox_filter};
    out center;
    """
    data = _post(base_url, ql)
    results = []
    for el in data.get("elements", []):
        tags = el.get("tags", {})
        center = el.get("center") or {"lat": el.get("lat"), "lon": el.get("lon")}
        osm_id = f"{el['type']}/{el['id']}"
        results.append(
            {
                "osm_id": osm_id,
                "name": tags.get("name", "Unknown course"),
                "location_lat": center.get("lat"),
                "location_lng": center.get("lon"),
                # Load individual holes only when the user imports this course.
                "hole_count": int(tags["golf:holes"]) if str(tags.get("golf:holes", "")).isdigit() else None,
            }
        )
    return results


def fetch_course_holes(osm_id: str, base_url: str) -> list[dict]:
    el_type, el_id = osm_id.split("/")
    ql = f"""
    [out:json][timeout:25];
    {el_type}({el_id});
    map_to_area->.course;
    (
      way["golf"="hole"](area.course);
      way["golf"="green"](area.course);
    );
    out geom;
    """
    data = _post(base_url, ql)
    greens_by_ref: dict[str, tuple[float, float]] = {}
    hole_ways = []
    for el in data.get("elements", []):
        if el.get("type") != "way":
            continue
        tags = el.get("tags", {})
        geometry = el.get("geometry") or []
        if tags.get("golf") == "green" and tags.get("ref") and geometry:
            greens_by_ref[tags["ref"]] = _centroid(geometry)
        elif tags.get("golf") == "hole":
            hole_ways.append(tags)

    holes = []
    for tags in hole_ways:
        ref = tags.get("ref")
        if ref is None or not str(ref).isdigit():
            continue
        par = tags.get("par")
        green = greens_by_ref.get(ref)
        holes.append(
            {
                "number": int(ref),
                "par": int(par) if par and str(par).isdigit() else None,
                "green_lat": green[0] if green else None,
                "green_lng": green[1] if green else None,
                # ponytail: hazard-to-hole association needs spatial nearest-hole
                # matching, which can't be verified from OSM refs alone — left null.
                # See spec decision log 2026-07-11.
                "hazards": None,
            }
        )
    return holes
