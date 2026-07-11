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
def auth_headers(client, db_session):
    bootstrap_admin(db_session)
    resp = client.post(
        "/api/auth/login",
        data={"username": settings.admin_email, "password": settings.admin_password},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
