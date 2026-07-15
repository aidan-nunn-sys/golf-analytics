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
