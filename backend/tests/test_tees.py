from datetime import date

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
