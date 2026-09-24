import httpx
import pytest

from app.integrations import nominatim


def test_geocode_returns_bbox_from_first_result(monkeypatch):
    def fake_get(base_url, params):
        assert params["q"] == "Lonnie Poole Golf Course"
        return [
            {"boundingbox": ["35.30", "35.80", "-78.90", "-78.40"]},
            {"boundingbox": ["1", "2", "3", "4"]},
        ]

    monkeypatch.setattr(nominatim, "_get", fake_get)

    # Nominatim orders its bbox [min_lat, max_lat, min_lng, max_lng]; we return
    # (min_lat, min_lng, max_lat, max_lng) to match Overpass's bbox filter.
    assert nominatim.geocode("Lonnie Poole Golf Course", "http://fake") == (
        35.30,
        -78.90,
        35.80,
        -78.40,
    )


def test_geocode_returns_none_when_nothing_matches(monkeypatch):
    monkeypatch.setattr(nominatim, "_get", lambda base_url, params: [])

    assert nominatim.geocode("nowhere at all", "http://fake") is None


def test_geocode_returns_none_when_result_has_no_bbox(monkeypatch):
    monkeypatch.setattr(nominatim, "_get", lambda base_url, params: [{"lat": "1"}])

    assert nominatim.geocode("odd result", "http://fake") is None


def test_geocode_sends_a_descriptive_user_agent():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["ua"] = request.headers.get("user-agent")
        return httpx.Response(200, json=[])

    transport = httpx.MockTransport(handler)
    with httpx.Client(transport=transport) as client:
        nominatim._get("http://fake", {"q": "x"}, client=client)

    assert "golf-analytics" in captured["ua"]


def test_geocode_widens_a_pinpoint_bbox(monkeypatch):
    """A POI node geocodes to a ~45m box that touches none of the course polygon's
    nodes, so Overpass's bbox filter finds nothing. Pad it to course scale."""
    monkeypatch.setattr(
        nominatim,
        "_get",
        lambda base_url, params: [
            {"boundingbox": ["36.5694535", "36.5698655", "-121.9499875", "-121.9495452"]}
        ],
    )

    min_lat, min_lng, max_lat, max_lng = nominatim.geocode("Pebble Beach", "http://fake")

    assert max_lat - min_lat == pytest.approx(nominatim.MIN_BBOX_DEGREES)
    assert max_lng - min_lng == pytest.approx(nominatim.MIN_BBOX_DEGREES)
    # still centred on the original match
    assert (min_lat + max_lat) / 2 == pytest.approx(36.5696595)
    assert (min_lng + max_lng) / 2 == pytest.approx(-121.94976635)


def test_geocode_leaves_a_large_bbox_alone(monkeypatch):
    monkeypatch.setattr(
        nominatim,
        "_get",
        lambda base_url, params: [{"boundingbox": ["35.0", "36.0", "-79.0", "-78.0"]}],
    )

    assert nominatim.geocode("Wake County", "http://fake") == (35.0, -79.0, 36.0, -78.0)
