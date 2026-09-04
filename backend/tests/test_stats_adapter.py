"""Direct tests for `_round_records`, the adapter between the DB and the walk.

`_round_records` builds every input the handicap engine ever sees — scope,
snapshot ratings, and the hole list — and had no direct test, which is how a
nine came to be scored over eighteen holes and a null stroke index came to be
replaced by the hole number. The engine's own unit fixtures hand-build their
hole lists, so they cannot catch a fault here.
"""

from app.config import settings
from app.models import User
from app.routers.stats import _round_records


def _admin(db_session):
    return db_session.query(User).filter_by(email=settings.admin_email).one()


def _create(client, auth_headers, course_id, tee_id, date, numbers, **extra):
    resp = client.post(
        "/api/rounds",
        json={
            "course_id": course_id, "date": date, "tee_set_id": tee_id,
            "status": "completed",
            "holes": [{"number": n, "strokes": 5} for n in numbers],
            **extra,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_round_records_for_an_eighteen_hole_round(
    client, auth_headers, db_session, rated_course
):
    course_id, tee_id = rated_course
    _create(client, auth_headers, course_id, tee_id, "2026-09-01", range(1, 19))

    db_session.expire_all()
    [record] = _round_records(db_session, _admin(db_session))

    assert record["scope"] == "18"
    assert (record["course_rating"], record["slope_rating"], record["par"]) == (
        71.2, 132, 72,
    )
    assert len(record["holes"]) == 18
    assert [h["stroke_index"] for h in record["holes"]] == list(range(1, 19))
    assert all(h["strokes"] == 5 for h in record["holes"])


def test_round_records_for_a_front_nine_covers_holes_one_to_nine(
    client, auth_headers, db_session, rated_course
):
    """The round has 18 `RoundHole` rows; only the front nine belongs to it."""
    course_id, tee_id = rated_course
    _create(
        client, auth_headers, course_id, tee_id, "2026-09-01", range(1, 10),
        hole_count=9, nine="front",
    )

    db_session.expire_all()
    [record] = _round_records(db_session, _admin(db_session))

    assert record["scope"] == "front9"
    assert (record["course_rating"], record["slope_rating"]) == (35.6, 130)
    assert len(record["holes"]) == 9
    assert [h["stroke_index"] for h in record["holes"]] == list(range(1, 10))
    # No unplayed back nine tagging along to be padded at net par.
    assert all(h["strokes"] == 5 for h in record["holes"])


def test_round_records_for_a_back_nine_covers_holes_ten_to_eighteen(
    client, auth_headers, db_session, rated_course
):
    course_id, tee_id = rated_course
    _create(
        client, auth_headers, course_id, tee_id, "2026-09-01", range(10, 19),
        hole_count=9, nine="back",
    )

    db_session.expire_all()
    [record] = _round_records(db_session, _admin(db_session))

    assert record["scope"] == "back9"
    assert (record["course_rating"], record["slope_rating"]) == (35.6, 134)
    assert len(record["holes"]) == 9
    assert [h["stroke_index"] for h in record["holes"]] == list(range(10, 19))
    assert all(h["strokes"] == 5 for h in record["holes"])


def test_round_records_passes_a_missing_stroke_index_through_as_none(
    client, auth_headers, db_session, seeded_course_via_api
):
    """Never substitute the hole number: it fabricates a stroke allocation."""
    course_id = seeded_course_via_api
    tee_id = client.post(
        f"/api/courses/{course_id}/tees", json={"name": "Blue"}, headers=auth_headers
    ).json()["id"]
    client.put(
        f"/api/tees/{tee_id}/ratings/18",
        json={"course_rating": 71.2, "slope_rating": 132, "par": 72},
        headers=auth_headers,
    )
    _create(client, auth_headers, course_id, tee_id, "2026-09-01", range(1, 19))

    db_session.expire_all()
    [record] = _round_records(db_session, _admin(db_session))

    assert all(h["stroke_index"] is None for h in record["holes"])


def test_round_records_excludes_in_progress_rounds_and_other_users(
    client, auth_headers, db_session, rated_course
):
    course_id, tee_id = rated_course
    client.post(
        "/api/rounds",
        json={"course_id": course_id, "date": "2026-09-01", "tee_set_id": tee_id},
        headers=auth_headers,
    )
    _create(client, auth_headers, course_id, tee_id, "2026-09-02", range(1, 19))

    client.post(
        "/api/admin/users",
        json={"email": "adapter@example.com", "password": "pw12345678",
              "display_name": "Adapter"},
        headers=auth_headers,
    )
    token = client.post(
        "/api/auth/login",
        data={"username": "adapter@example.com", "password": "pw12345678"},
    ).json()["access_token"]
    other = {"Authorization": f"Bearer {token}"}
    _create(client, other, course_id, tee_id, "2026-09-03", range(1, 19))

    db_session.expire_all()
    records = _round_records(db_session, _admin(db_session))

    # Only the admin's own completed round: the in_progress one has no final
    # scorecard, and rounds stay strictly per-user even on a shared course.
    assert len(records) == 1
    assert records[0]["date"].isoformat() == "2026-09-02"
