from app.integrations import overpass


def test_search_courses_parses_name_and_center(monkeypatch):
    def fake_post(base_url, ql):
        if "leisure" in ql:
            return {
                "elements": [
                    {
                        "type": "way",
                        "id": 123,
                        "tags": {"name": "Pebble Beach"},
                        "center": {"lat": 36.5, "lon": -121.9},
                    }
                ]
            }
        return {"elements": []}

    monkeypatch.setattr(overpass, "_post", fake_post)
    results = overpass.search_courses("Pebble", "http://fake")
    assert results == [
        {
            "osm_id": "way/123",
            "name": "Pebble Beach",
            "location_lat": 36.5,
            "location_lng": -121.9,
            "hole_count": 0,
        }
    ]

def test_fetch_course_holes_matches_green_by_ref(monkeypatch):
    def fake_post(base_url, ql):
        return {
            "elements": [
                {"type": "way", "tags": {"golf": "hole", "ref": "1", "par": "4"}, "geometry": []},
                {
                    "type": "way",
                    "tags": {"golf": "green", "ref": "1"},
                    "geometry": [{"lat": 10.0, "lon": 20.0}, {"lat": 10.0, "lon": 22.0}],
                },
            ]
        }

    monkeypatch.setattr(overpass, "_post", fake_post)
    holes = overpass.fetch_course_holes("way/1", "http://fake")
    assert holes == [
        {"number": 1, "par": 4, "green_lat": 10.0, "green_lng": 21.0, "hazards": None}
    ]

def test_fetch_course_holes_no_hole_data_returns_empty(monkeypatch):
    monkeypatch.setattr(overpass, "_post", lambda base_url, ql: {"elements": []})
    assert overpass.fetch_course_holes("way/1", "http://fake") == []
