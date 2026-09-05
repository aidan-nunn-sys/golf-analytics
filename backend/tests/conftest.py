import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import api, app


@pytest.fixture
def db_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    import app.models  # noqa: F401  ensure models are registered

    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session(db_engine):
    TestingSession = sessionmaker(bind=db_engine, autoflush=False, autocommit=False)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db_engine):
    TestingSession = sessionmaker(bind=db_engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    # The API routes live on the `api` sub-app mounted at /api (see app/main.py),
    # which has its own dependency_overrides separate from the outer `app` -
    # override on both so the test DB is actually used.
    app.dependency_overrides[get_db] = override_get_db
    api.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    api.dependency_overrides.clear()


from app.config import settings
from app.seed import bootstrap_admin


@pytest.fixture
def seeded_user_and_course(db_session):
    """A user, an 18-hole course with par-4 holes and stroke indexes 1..18,
    and a Blue tee rated for 18 / front9 / back9."""
    from app.models import Course, Hole, TeeRating, TeeSet, User
    from app.seed import bootstrap_admin

    user = bootstrap_admin(db_session)
    if user is None:
        user = db_session.query(User).filter_by(email=settings.admin_email).one()
    course = Course(name="Lonnie Poole", import_source="manual")
    db_session.add(course)
    db_session.flush()
    for n in range(1, 19):
        db_session.add(Hole(course_id=course.id, number=n, par=4, stroke_index=n))
    tee = TeeSet(course_id=course.id, name="Blue", yardage=6200)
    db_session.add(tee)
    db_session.flush()
    db_session.add_all([
        TeeRating(tee_set_id=tee.id, scope="18", course_rating=71.2, slope_rating=132, par=72),
        TeeRating(tee_set_id=tee.id, scope="front9", course_rating=35.6, slope_rating=130, par=36),
        TeeRating(tee_set_id=tee.id, scope="back9", course_rating=35.6, slope_rating=134, par=36),
    ])
    db_session.commit()
    db_session.refresh(course)
    return user, course, tee


@pytest.fixture
def seeded_course_via_api(client, auth_headers):
    """An 18-hole course created through the API; returns its id."""
    resp = client.post(
        "/api/courses",
        json={
            "name": "Lonnie Poole",
            "holes": [{"number": n, "par": 4} for n in range(1, 19)],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.fixture
def rated_course(client, auth_headers, seeded_course_via_api):
    """A course with stroke indexes and a Blue tee rated for 18/front9/back9.
    Returns (course_id, tee_id)."""
    course_id = seeded_course_via_api
    client.put(
        f"/api/courses/{course_id}/stroke-index",
        json={"stroke_indexes": list(range(1, 19))},
        headers=auth_headers,
    )
    tee_id = client.post(
        f"/api/courses/{course_id}/tees",
        json={"name": "Blue", "yardage": 6200},
        headers=auth_headers,
    ).json()["id"]
    for scope, cr, slope, par in [
        ("18", 71.2, 132, 72), ("front9", 35.6, 130, 36), ("back9", 35.6, 134, 36),
    ]:
        client.put(
            f"/api/tees/{tee_id}/ratings/{scope}",
            json={"course_rating": cr, "slope_rating": slope, "par": par},
            headers=auth_headers,
        )
    return course_id, tee_id


@pytest.fixture
def auth_headers(client, db_session):
    bootstrap_admin(db_session)
    resp = client.post(
        "/api/auth/login",
        data={"username": settings.admin_email, "password": settings.admin_password},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
