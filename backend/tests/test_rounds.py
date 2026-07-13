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
