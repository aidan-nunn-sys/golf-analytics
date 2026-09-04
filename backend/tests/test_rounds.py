from datetime import date

from app.models import Course, Hole, Round, RoundHole


def test_round_and_round_hole_round_trip(db_session):
    course = Course(name="Test Links", import_source="manual")
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)
    hole = Hole(course_id=course.id, number=1, par=4)
    db_session.add(hole)
    db_session.commit()
    db_session.refresh(hole)

    r = Round(user_id=1, course_id=course.id, date=date(2026, 7, 12))
    db_session.add(r)
    db_session.commit()
    db_session.refresh(r)
    rh = RoundHole(round_id=r.id, hole_id=hole.id, par=hole.par)
    db_session.add(rh)
    db_session.commit()

    assert r.status == "in_progress"
    assert r.current_hole == 1
    assert rh.strokes is None


def _make_course(db_session):
    from app.models import Course, Hole

    course = Course(name="Test Links", import_source="manual")
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)
    for n, par in [(1, 4), (2, 3), (3, 5)]:
        db_session.add(Hole(course_id=course.id, number=n, par=par))
    db_session.commit()
    return course


def test_create_round_creates_round_hole_per_hole(client, auth_headers, db_session):
    course = _make_course(db_session)
    resp = client.post("/api/rounds", json={"course_id": course.id}, headers=auth_headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "in_progress"
    assert body["current_hole"] == 1
    assert [h["hole_number"] for h in body["holes"]] == [1, 2, 3]
    assert [h["par"] for h in body["holes"]] == [4, 3, 5]


def test_create_round_requires_holes(client, auth_headers, db_session):
    from app.models import Course

    course = Course(name="Empty", import_source="manual")
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)
    resp = client.post("/api/rounds", json={"course_id": course.id}, headers=auth_headers)
    assert resp.status_code == 422


def test_list_rounds_scoped_to_user(client, auth_headers, db_session):
    course = _make_course(db_session)
    client.post("/api/rounds", json={"course_id": course.id}, headers=auth_headers)
    resp = client.get("/api/rounds", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_update_round_advances_hole_and_completes(client, auth_headers, db_session):
    course = _make_course(db_session)
    rid = client.post("/api/rounds", json={"course_id": course.id}, headers=auth_headers).json()["id"]
    resp = client.patch(f"/api/rounds/{rid}", json={"current_hole": 2}, headers=auth_headers)
    assert resp.json()["current_hole"] == 2
    resp = client.patch(f"/api/rounds/{rid}", json={"status": "completed"}, headers=auth_headers)
    assert resp.json()["status"] == "completed"


def test_update_round_hole_strokes(client, auth_headers, db_session):
    course = _make_course(db_session)
    rid = client.post("/api/rounds", json={"course_id": course.id}, headers=auth_headers).json()["id"]
    resp = client.patch(f"/api/rounds/{rid}/holes/2", json={"strokes": 3}, headers=auth_headers)
    assert resp.status_code == 200
    hole2 = next(h for h in resp.json()["holes"] if h["hole_number"] == 2)
    assert hole2["strokes"] == 3


def test_round_not_visible_to_a_different_user(client, auth_headers, db_session):
    from app.seed import create_user

    course = _make_course(db_session)
    rid = client.post("/api/rounds", json={"course_id": course.id}, headers=auth_headers).json()["id"]

    create_user(db_session, email="second@example.com", password="pw12345")
    login = client.post(
        "/api/auth/login", data={"username": "second@example.com", "password": "pw12345"}
    )
    second_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    resp = client.get(f"/api/rounds/{rid}", headers=second_headers)
    assert resp.status_code == 404


def test_log_round_shot_computes_carry_from_gps_points(client, auth_headers, db_session):
    course = _make_course(db_session)
    rid = client.post("/api/rounds", json={"course_id": course.id}, headers=auth_headers).json()["id"]
    clubs = client.get("/api/clubs", headers=auth_headers).json()
    club_id = clubs[0]["id"]

    resp = client.post(
        f"/api/rounds/{rid}/shots",
        json={
            "club_id": club_id,
            "start_lat": 36.5,
            "start_lng": -121.9,
            "end_lat": 36.501,
            "end_lng": -121.9,
            "direction": "straight",
            "hole_number": 2,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["round_id"] == rid
    assert body["hole_number"] == 2
    assert body["session_id"] is None
    assert body["source"] == "gps"
    assert body["carry_yards"] is None
    assert 115 < body["total_yards"] < 125


def test_log_round_shot_defaults_hole_number_to_current_hole(client, auth_headers, db_session):
    course = _make_course(db_session)
    rid = client.post("/api/rounds", json={"course_id": course.id}, headers=auth_headers).json()["id"]
    client.patch(f"/api/rounds/{rid}", json={"current_hole": 3}, headers=auth_headers)
    club_id = client.get("/api/clubs", headers=auth_headers).json()[0]["id"]

    resp = client.post(
        f"/api/rounds/{rid}/shots",
        json={
            "club_id": club_id,
            "start_lat": 36.5, "start_lng": -121.9,
            "end_lat": 36.501, "end_lng": -121.9,
        },
        headers=auth_headers,
    )
    assert resp.json()["hole_number"] == 3


def test_round_snapshots_the_tee_rating(client, auth_headers, rated_course):
    course_id, tee_id = rated_course
    resp = client.post(
        "/api/rounds",
        json={"course_id": course_id, "date": "2026-09-01", "tee_set_id": tee_id},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["course_rating"] == 71.2
    assert body["slope_rating"] == 132
    assert body["course_par"] == 72
    assert body["hole_count"] == 18


def test_snapshot_does_not_change_when_the_tee_is_re_rated(
    client, auth_headers, rated_course
):
    course_id, tee_id = rated_course
    round_id = client.post(
        "/api/rounds",
        json={"course_id": course_id, "date": "2026-09-01", "tee_set_id": tee_id},
        headers=auth_headers,
    ).json()["id"]

    client.put(
        f"/api/tees/{tee_id}/ratings/18",
        json={"course_rating": 69.0, "slope_rating": 118, "par": 72},
        headers=auth_headers,
    )

    fetched = client.get(f"/api/rounds/{round_id}", headers=auth_headers).json()
    assert fetched["course_rating"] == 71.2  # unchanged
    assert fetched["slope_rating"] == 132


def test_nine_hole_round_snapshots_the_nine_rating(client, auth_headers, rated_course):
    course_id, tee_id = rated_course
    resp = client.post(
        "/api/rounds",
        json={
            "course_id": course_id, "date": "2026-09-01", "tee_set_id": tee_id,
            "hole_count": 9, "nine": "front",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["course_rating"] == 35.6
    assert resp.json()["slope_rating"] == 130


def test_nine_hole_round_requires_nine(client, auth_headers, rated_course):
    course_id, tee_id = rated_course
    resp = client.post(
        "/api/rounds",
        json={
            "course_id": course_id, "date": "2026-09-01",
            "tee_set_id": tee_id, "hole_count": 9,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_round_rejects_a_tee_missing_the_required_scope(
    client, auth_headers, seeded_course_via_api
):
    course_id = seeded_course_via_api
    tee_id = client.post(
        f"/api/courses/{course_id}/tees", json={"name": "Bare"}, headers=auth_headers
    ).json()["id"]
    resp = client.post(
        "/api/rounds",
        json={"course_id": course_id, "date": "2026-09-01", "tee_set_id": tee_id},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert "rating" in resp.json()["detail"].lower()


def test_backlog_round_created_complete_with_inline_holes(
    client, auth_headers, rated_course
):
    course_id, tee_id = rated_course
    resp = client.post(
        "/api/rounds",
        json={
            "course_id": course_id, "date": "2025-06-14", "tee_set_id": tee_id,
            "status": "completed",
            "holes": [{"number": n, "strokes": 5} for n in range(1, 19)],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "completed"
    assert len(body["holes"]) == 18
    assert all(h["strokes"] == 5 for h in body["holes"])


def test_round_can_be_marked_abandoned(client, auth_headers, rated_course):
    """Walking off is a real state (spec 3.2); it must not look in_progress."""
    course_id, tee_id = rated_course
    round_id = client.post(
        "/api/rounds",
        json={"course_id": course_id, "date": "2026-09-01", "tee_set_id": tee_id},
        headers=auth_headers,
    ).json()["id"]

    resp = client.patch(
        f"/api/rounds/{round_id}", json={"status": "abandoned"}, headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "abandoned"


def test_patch_hole_accepts_stat_detail(client, auth_headers, rated_course):
    course_id, tee_id = rated_course
    round_id = client.post(
        "/api/rounds",
        json={"course_id": course_id, "date": "2026-09-01", "tee_set_id": tee_id},
        headers=auth_headers,
    ).json()["id"]

    resp = client.patch(
        f"/api/rounds/{round_id}/holes/1",
        json={"strokes": 5, "putts": 2, "fairway_hit": True, "penalties": 1},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    hole = next(h for h in resp.json()["holes"] if h["hole_number"] == 1)
    assert (hole["putts"], hole["fairway_hit"], hole["penalties"]) == (2, True, 1)


def test_round_rejects_a_tee_from_a_different_course(client, auth_headers, rated_course):
    """A tee_set_id must belong to the round's own course, not just be rated
    for the requested scope (reviewer finding on Task 7/8)."""
    course_id, _tee_id = rated_course

    other_course_id = client.post(
        "/api/courses",
        json={
            "name": "Other Course",
            "holes": [{"number": n, "par": 4} for n in range(1, 19)],
        },
        headers=auth_headers,
    ).json()["id"]
    other_tee_id = client.post(
        f"/api/courses/{other_course_id}/tees", json={"name": "Blue"}, headers=auth_headers
    ).json()["id"]
    client.put(
        f"/api/tees/{other_tee_id}/ratings/18",
        json={"course_rating": 70.0, "slope_rating": 120, "par": 72},
        headers=auth_headers,
    )

    resp = client.post(
        "/api/rounds",
        json={"course_id": course_id, "date": "2026-09-01", "tee_set_id": other_tee_id},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert "course" in resp.json()["detail"].lower()
