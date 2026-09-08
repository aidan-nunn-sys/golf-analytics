"""Round-trip test for Course and Hole models."""

from unittest.mock import patch

import pytest

from app.models import Course, Hole


def test_course_and_hole_round_trip(db_session):
    """Insert Course and Hole, verify they round-trip."""
    course = Course(
        name="Pebble Beach",
        osm_id="w123456",
        import_source="openstreetmap",
        location_lat=36.563,
        location_lng=-121.949,
    )
    db_session.add(course)
    db_session.commit()

    hole = Hole(
        course_id=course.id,
        number=1,
        par=4,
        green_lat=36.5631,
        green_lng=-121.9490,
        hazards=["ocean", "bunker"],
    )
    db_session.add(hole)
    db_session.commit()

    # Fetch and verify
    retrieved_course = db_session.query(Course).filter_by(id=course.id).one()
    assert retrieved_course.name == "Pebble Beach"
    assert retrieved_course.osm_id == "w123456"
    assert retrieved_course.import_source == "openstreetmap"
    assert retrieved_course.location_lat == 36.563
    assert retrieved_course.location_lng == -121.949

    retrieved_hole = db_session.query(Hole).filter_by(id=hole.id).one()
    assert retrieved_hole.course_id == course.id
    assert retrieved_hole.number == 1
    assert retrieved_hole.par == 4
    assert retrieved_hole.green_lat == 36.5631
    assert retrieved_hole.green_lng == -121.9490
    assert retrieved_hole.hazards == ["ocean", "bunker"]


def test_search_courses_proxies_overpass(client, auth_headers):
    with patch(
        "app.routers.courses.overpass.search_courses",
        return_value=[
            {"osm_id": "way/1", "name": "Test Links", "location_lat": 1.0, "location_lng": 2.0, "hole_count": 18}
        ],
    ):
        resp = client.get("/api/courses?search=Test", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()[0]["osm_id"] == "way/1"


def test_search_courses_forwards_bbox(client, auth_headers):
    with patch(
        "app.routers.courses.overpass.search_courses", return_value=[]
    ) as mock_search:
        client.get(
            "/api/courses?search=Test&min_lat=1&min_lng=2&max_lat=3&max_lng=4",
            headers=auth_headers,
        )
    mock_search.assert_called_once_with(
        "Test", mock_search.call_args.args[1], bbox=(1.0, 2.0, 3.0, 4.0)
    )


def test_import_course_from_osm(client, auth_headers):
    with patch(
        "app.routers.courses.overpass.fetch_course_holes",
        return_value=[{"number": 1, "par": 4, "green_lat": None, "green_lng": None, "hazards": None}],
    ):
        resp = client.post(
            "/api/courses",
            json={"name": "Test Links", "osm_id": "way/1", "location_lat": 1.0, "location_lng": 2.0},
            headers=auth_headers,
        )
    assert resp.status_code == 201
    body = resp.json()
    assert body["import_source"] == "osm"
    assert len(body["holes"]) == 1


def test_import_course_rolls_back_on_hole_fetch_failure(client, auth_headers, db_session):
    """If Overpass fails mid-import, no orphan holeless Course row should persist."""
    with patch(
        "app.routers.courses.overpass.fetch_course_holes",
        side_effect=RuntimeError("overpass 504"),
    ):
        with pytest.raises(RuntimeError):
            client.post(
                "/api/courses",
                json={"name": "Broken Links", "osm_id": "way/999"},
                headers=auth_headers,
            )

    orphans = db_session.query(Course).filter_by(osm_id="way/999").all()
    assert orphans == []

    # A retry after the transient failure clears should succeed normally (no
    # holeless dedupe-return of a broken row, since nothing was persisted).
    with patch("app.routers.courses.overpass.fetch_course_holes", return_value=[]):
        retry = client.post(
            "/api/courses", json={"name": "Broken Links", "osm_id": "way/999"}, headers=auth_headers
        )
    assert retry.status_code == 201


def test_import_course_dedupes_by_osm_id(client, auth_headers):
    with patch("app.routers.courses.overpass.fetch_course_holes", return_value=[]):
        first = client.post(
            "/api/courses", json={"name": "Test Links", "osm_id": "way/1"}, headers=auth_headers
        ).json()
        second = client.post(
            "/api/courses", json={"name": "Test Links", "osm_id": "way/1"}, headers=auth_headers
        ).json()
    assert first["id"] == second["id"]


def test_import_course_manual(client, auth_headers):
    resp = client.post(
        "/api/courses",
        json={"name": "Backyard Links", "holes": [{"number": 1, "par": 3}, {"number": 2, "par": 4}]},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["import_source"] == "manual"
    assert len(body["holes"]) == 2


def test_import_course_manual_requires_holes(client, auth_headers):
    resp = client.post("/api/courses", json={"name": "No Holes"}, headers=auth_headers)
    assert resp.status_code == 422


def test_course_is_visible_to_a_different_user(client, auth_headers, db_session):
    from app.seed import create_user

    with patch("app.routers.courses.overpass.fetch_course_holes", return_value=[]):
        created = client.post(
            "/api/courses", json={"name": "Shared Links", "osm_id": "way/9"}, headers=auth_headers
        ).json()

    create_user(db_session, email="second@example.com", password="pw12345")
    login = client.post(
        "/api/auth/login", data={"username": "second@example.com", "password": "pw12345"}
    )
    second_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    resp = client.get(f"/api/courses/{created['id']}", headers=second_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_hole_out_includes_stroke_index(client, auth_headers):
    created = client.post(
        "/api/courses",
        json={"name": "SI Links", "holes": [{"number": 1, "par": 4}, {"number": 2, "par": 3}]},
        headers=auth_headers,
    ).json()
    assert created["holes"][0]["stroke_index"] is None

    put = client.put(
        f"/api/courses/{created['id']}/stroke-index",
        json={"stroke_indexes": [2, 1]},
        headers=auth_headers,
    )
    assert put.status_code == 200

    fetched = client.get(f"/api/courses/{created['id']}", headers=auth_headers).json()
    assert [h["stroke_index"] for h in fetched["holes"]] == [2, 1]


def test_course_library_lists_imported_courses(client, auth_headers):
    empty = client.get("/api/courses/library", headers=auth_headers)
    assert empty.status_code == 200
    assert empty.json() == []

    client.post(
        "/api/courses",
        json={"name": "Backyard Links", "holes": [{"number": 1, "par": 3}]},
        headers=auth_headers,
    )
    listed = client.get("/api/courses/library", headers=auth_headers)
    assert listed.status_code == 200
    names = [c["name"] for c in listed.json()]
    assert "Backyard Links" in names
    assert "holes" in listed.json()[0]


def test_course_library_requires_auth(client):
    assert client.get("/api/courses/library").status_code == 401
