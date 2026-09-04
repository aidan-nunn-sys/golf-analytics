from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Course, Hole, Round, RoundHole, TeeSet, TeeRating


def test_tee_rating_scopes_persist(db_session):
    course = Course(name="Lonnie Poole", import_source="manual")
    db_session.add(course)
    db_session.flush()

    tee = TeeSet(course_id=course.id, name="Blue", yardage=6200)
    db_session.add(tee)
    db_session.flush()

    db_session.add_all([
        TeeRating(tee_set_id=tee.id, scope="18", course_rating=71.2, slope_rating=132, par=72),
        TeeRating(tee_set_id=tee.id, scope="front9", course_rating=35.6, slope_rating=130, par=36),
    ])
    db_session.commit()

    scopes = {r.scope: r for r in tee.ratings}
    assert set(scopes) == {"18", "front9"}
    assert scopes["18"].slope_rating == 132
    assert scopes["front9"].course_rating == 35.6


def test_hole_carries_stroke_index(db_session):
    course = Course(name="Lonnie Poole", import_source="manual")
    db_session.add(course)
    db_session.flush()
    hole = Hole(course_id=course.id, number=1, par=4, stroke_index=7)
    db_session.add(hole)
    db_session.commit()
    assert hole.stroke_index == 7


def test_round_snapshots_rating_and_hole_stats(db_session, seeded_user_and_course):
    user, course, tee = seeded_user_and_course
    rnd = Round(
        user_id=user.id, course_id=course.id, date=date(2026, 9, 1),
        tee_set_id=tee.id, hole_count=18, nine=None,
        course_rating=71.2, slope_rating=132, course_par=72,
    )
    db_session.add(rnd)
    db_session.flush()
    rh = RoundHole(round_id=rnd.id, hole_id=course.holes[0].id, par=4,
                   strokes=5, putts=2, fairway_hit=True, penalties=0)
    db_session.add(rh)
    db_session.commit()

    assert rnd.course_rating == 71.2
    assert rnd.status == "in_progress"
    assert rh.putts == 2 and rh.fairway_hit is True and rh.penalties == 0


def test_tee_rating_scope_unique_per_tee_set(db_session):
    course = Course(name="Lonnie Poole", import_source="manual")
    db_session.add(course)
    db_session.flush()

    tee = TeeSet(course_id=course.id, name="Blue", yardage=6200)
    db_session.add(tee)
    db_session.flush()

    db_session.add(
        TeeRating(tee_set_id=tee.id, scope="18", course_rating=71.2, slope_rating=132, par=72)
    )
    db_session.commit()

    db_session.add(
        TeeRating(tee_set_id=tee.id, scope="18", course_rating=70.0, slope_rating=125, par=72)
    )
    with pytest.raises(IntegrityError):
        db_session.flush()



VALID_SI = list(range(1, 19))


def test_create_and_list_tees(client, auth_headers, seeded_course_via_api):
    course_id = seeded_course_via_api
    resp = client.post(
        f"/api/courses/{course_id}/tees",
        json={"name": "White", "yardage": 5800},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["name"] == "White"

    listed = client.get(f"/api/courses/{course_id}/tees", headers=auth_headers)
    assert listed.status_code == 200
    assert [t["name"] for t in listed.json()] == ["White"]


def test_upsert_rating_by_scope(client, auth_headers, seeded_course_via_api):
    course_id = seeded_course_via_api
    tee_id = client.post(
        f"/api/courses/{course_id}/tees", json={"name": "Blue"}, headers=auth_headers
    ).json()["id"]

    body = {"course_rating": 71.2, "slope_rating": 132, "par": 72}
    first = client.put(f"/api/tees/{tee_id}/ratings/18", json=body, headers=auth_headers)
    assert first.status_code == 200

    # Upsert, not duplicate.
    body["slope_rating"] = 134
    second = client.put(f"/api/tees/{tee_id}/ratings/18", json=body, headers=auth_headers)
    assert second.status_code == 200

    ratings = client.get(f"/api/courses/{course_id}/tees", headers=auth_headers).json()
    assert len(ratings[0]["ratings"]) == 1
    assert ratings[0]["ratings"][0]["slope_rating"] == 134


def test_rating_rejects_bad_scope_and_slope(client, auth_headers, seeded_course_via_api):
    course_id = seeded_course_via_api
    tee_id = client.post(
        f"/api/courses/{course_id}/tees", json={"name": "Blue"}, headers=auth_headers
    ).json()["id"]

    bad_scope = client.put(
        f"/api/tees/{tee_id}/ratings/middle",
        json={"course_rating": 71.2, "slope_rating": 132, "par": 72},
        headers=auth_headers,
    )
    assert bad_scope.status_code == 422

    bad_slope = client.put(
        f"/api/tees/{tee_id}/ratings/18",
        json={"course_rating": 71.2, "slope_rating": 200, "par": 72},
        headers=auth_headers,
    )
    assert bad_slope.status_code == 422


def test_stroke_index_must_be_a_permutation(client, auth_headers, seeded_course_via_api):
    course_id = seeded_course_via_api

    ok = client.put(
        f"/api/courses/{course_id}/stroke-index",
        json={"stroke_indexes": VALID_SI},
        headers=auth_headers,
    )
    assert ok.status_code == 200

    duplicated = VALID_SI[:-1] + [1]
    bad = client.put(
        f"/api/courses/{course_id}/stroke-index",
        json={"stroke_indexes": duplicated},
        headers=auth_headers,
    )
    assert bad.status_code == 422
    assert "permutation" in bad.json()["detail"].lower()


def test_tee_endpoints_require_auth(client, seeded_course_via_api):
    assert client.get(f"/api/courses/{seeded_course_via_api}/tees").status_code == 401
