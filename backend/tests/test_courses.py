"""Round-trip test for Course and Hole models."""

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
