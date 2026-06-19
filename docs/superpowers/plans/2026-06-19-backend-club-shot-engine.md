# Backend API — Club & Shot Analysis Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the self-hostable JSON API for the v1 Club & Shot Analysis engine — accounts (invite/admin), a club bag, range sessions, manual shot logging, and derived per-club + gapping statistics.

**Architecture:** FastAPI app over SQLAlchemy 2.0 models on SQLite. Auth is JWT bearer tokens; accounts are admin-created (no open signup) with a bootstrap admin seeded at first run. Statistics are computed on demand by a pure, dependency-light engine module (no stored aggregates). Tables are created with `Base.metadata.create_all()` for v1; Alembic is deferred until the schema needs to evolve.

**Tech Stack:** Python 3.12, FastAPI, Uvicorn, SQLAlchemy 2.0, Pydantic v2 + pydantic-settings, passlib[bcrypt], python-jose, pandas, pytest, httpx.

## Global Constraints

- Python 3.12+; SQLAlchemy 2.0 typed declarative style (`Mapped` / `mapped_column`).
- Distances stored canonically in **yards** (float). `unit_preference` affects display only (frontend).
- **No open self-signup.** Accounts are created only by an admin. Bootstrap admin comes from env (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) at first run.
- Stats are **derived**, never stored.
- `direction` ∈ {`left`, `straight`, `right`}. `source` ∈ {`manual`, `launch_monitor`, `gps`} (only `manual` is wired in v1). `category` ∈ {`wood`, `hybrid`, `iron`, `wedge`, `putter`}.
- Every list endpoint returns only the calling user's own rows (per-user isolation).
- All code lives under `backend/`. Tests under `backend/tests/`. Run tests from `backend/`.

---

### Task 1: Project scaffold + health endpoint

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py` (empty)
- Create: `backend/app/config.py`
- Create: `backend/app/main.py`
- Create: `backend/tests/__init__.py` (empty)
- Create: `backend/tests/conftest.py`
- Test: `backend/tests/test_health.py`

**Interfaces:**
- Produces: `app.main.app` (FastAPI instance); `app.config.settings` (Settings singleton with `secret_key`, `admin_email`, `admin_password`, `database_url`, `access_token_expire_minutes`).
- Produces test fixture `client` (FastAPI `TestClient`).

- [ ] **Step 1: Write `pyproject.toml`**

```toml
[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[project]
name = "golf-analytics-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.110",
  "uvicorn[standard]>=0.29",
  "sqlalchemy>=2.0",
  "pydantic[email]>=2.6",
  "pydantic-settings>=2.2",
  "passlib[bcrypt]>=1.7",
  "python-jose[cryptography]>=3.3",
  "python-multipart>=0.0.9",
  "pandas>=2.2",
]

[project.optional-dependencies]
dev = ["pytest>=8", "httpx>=0.27"]

# Only ship the app package; keep setuptools from also trying to package tests/.
[tool.setuptools]
packages = ["app"]

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
```

- [ ] **Step 2: Write `app/config.py`**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    database_url: str = "sqlite:///./golf.db"
    admin_email: str = "admin@example.com"
    admin_password: str = "changeme"


settings = Settings()
```

- [ ] **Step 3: Write `app/main.py`**

```python
from fastapi import FastAPI

app = FastAPI(title="Golf Analytics API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 4: Write `tests/conftest.py`** (the shared test client; DB wiring is added in Task 2)

```python
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
```

- [ ] **Step 5: Write the failing test `tests/test_health.py`**

```python
def test_health_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 6: Install deps and run the test**

Run (from `backend/`): `pip install -e ".[dev]" && pytest tests/test_health.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "Add backend scaffold and health endpoint"
```

---

### Task 2: Database layer + test isolation

**Files:**
- Create: `backend/app/database.py`
- Modify: `backend/app/main.py` (create tables on startup)
- Modify: `backend/tests/conftest.py` (override DB with isolated in-memory SQLite)

**Interfaces:**
- Produces: `app.database.Base` (declarative base); `app.database.engine`; `app.database.SessionLocal`; `get_db()` dependency yielding a `Session`; `create_db_and_tables()`.
- Produces test fixture `db_session` and a DB-backed `client` that uses an isolated in-memory database per test.

- [ ] **Step 1: Write `app/database.py`**

```python
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

engine = create_engine(
    settings.database_url, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def create_db_and_tables() -> None:
    # Import models so they register on Base.metadata before create_all.
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 2: Create `app/models/__init__.py`** (empty for now; populated as models are added)

```python
```

- [ ] **Step 3: Wire table creation into `app/main.py`**

Replace the file with:

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import create_db_and_tables


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield


app = FastAPI(title="Golf Analytics API", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 4: Replace `tests/conftest.py` with isolated-DB wiring**

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


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

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
```

- [ ] **Step 5: Run existing tests to confirm nothing broke**

Run (from `backend/`): `pytest -v`
Expected: `test_health_ok` PASSES.

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "Add SQLAlchemy database layer and isolated test DB"
```

---

### Task 3: User model + security (hashing + JWT)

**Files:**
- Create: `backend/app/models/user.py`
- Modify: `backend/app/models/__init__.py` (export `User`)
- Create: `backend/app/security.py`
- Test: `backend/tests/test_security.py`

**Interfaces:**
- Produces model `User(id:int, email:str, password_hash:str, display_name:str, is_admin:bool, unit_preference:str, created_at:datetime)`.
- Produces `security.hash_password(p:str)->str`, `security.verify_password(p:str, h:str)->bool`, `security.create_access_token(subject:str)->str`, `security.decode_token(token:str)->str|None` (returns subject/email or None).

- [ ] **Step 1: Write `app/models/user.py`**

```python
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    display_name: Mapped[str] = mapped_column(String, nullable=False, default="")
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    unit_preference: Mapped[str] = mapped_column(String, nullable=False, default="yards")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
```

- [ ] **Step 2: Export the model in `app/models/__init__.py`**

```python
from app.models.user import User

__all__ = ["User"]
```

- [ ] **Step 3: Write the failing test `tests/test_security.py`**

```python
from app.security import (
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
)


def test_password_hash_roundtrip():
    h = hash_password("s3cret")
    assert h != "s3cret"
    assert verify_password("s3cret", h) is True
    assert verify_password("wrong", h) is False


def test_token_roundtrip():
    token = create_access_token("user@example.com")
    assert decode_token(token) == "user@example.com"


def test_decode_bad_token_returns_none():
    assert decode_token("not-a-real-token") is None
```

- [ ] **Step 4: Run to verify it fails**

Run: `pytest tests/test_security.py -v`
Expected: FAIL (`ModuleNotFoundError: app.security`).

- [ ] **Step 5: Write `app/security.py`**

```python
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _pwd.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _pwd.verify(password, password_hash)


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError:
        return None
    return payload.get("sub")
```

- [ ] **Step 6: Run to verify it passes**

Run: `pytest tests/test_security.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "Add User model and security helpers"
```

---

### Task 4: Bootstrap admin, login, and admin-created accounts

**Files:**
- Create: `backend/app/schemas/__init__.py` (empty)
- Create: `backend/app/schemas/user.py`
- Create: `backend/app/deps.py`
- Create: `backend/app/seed.py`
- Create: `backend/app/routers/__init__.py` (empty)
- Create: `backend/app/routers/auth.py`
- Create: `backend/app/routers/admin.py`
- Modify: `backend/app/main.py` (include routers + bootstrap admin on startup)
- Test: `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: `User`, `get_db`, security helpers.
- Produces deps `get_current_user(...) -> User` and `get_current_admin(...) -> User` (HTTP 401/403 on failure).
- Produces `seed.create_user(db, email, password, display_name, is_admin=False) -> User` and `seed.bootstrap_admin(db) -> None`.
- Produces endpoints: `POST /auth/login` (form: `username`,`password`) → `{access_token, token_type}`; `GET /auth/me` → user; `PATCH /auth/me` (update `display_name`/`unit_preference`); `POST /admin/users` (admin only) → created user.
- Produces test fixtures `admin_token` and `auth_headers` (Authorization header dict for the bootstrap admin).

- [ ] **Step 1: Write `app/schemas/user.py`**

```python
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    display_name: str
    is_admin: bool
    unit_preference: str
    created_at: datetime


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    display_name: str = ""


class UserUpdate(BaseModel):
    display_name: str | None = None
    unit_preference: str | None = None  # "yards" or "meters"


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
```

- [ ] **Step 2: Write `app/seed.py`** (note: club-bag seeding is added in Task 5)

```python
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import User
from app.security import hash_password


def create_user(
    db: Session,
    email: str,
    password: str,
    display_name: str = "",
    is_admin: bool = False,
) -> User:
    user = User(
        email=email,
        password_hash=hash_password(password),
        display_name=display_name,
        is_admin=is_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def bootstrap_admin(db: Session) -> None:
    existing = db.scalars(select(User).limit(1)).first()
    if existing is not None:
        return
    create_user(
        db,
        email=settings.admin_email,
        password=settings.admin_password,
        display_name="Admin",
        is_admin=True,
    )
```

- [ ] **Step 3: Write `app/deps.py`**

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    email = decode_token(token)
    if email is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    user = db.scalars(select(User).where(User.email == email)).first()
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    return user


def get_current_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    return user
```

- [ ] **Step 4: Write `app/routers/auth.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.user import Token, UserOut, UserUpdate
from app.security import create_access_token, verify_password

router = APIRouter(tags=["auth"])


@router.post("/auth/login", response_model=Token)
def login(
    form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
) -> Token:
    user = db.scalars(select(User).where(User.email == form.username)).first()
    if user is None or not verify_password(form.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    return Token(access_token=create_access_token(user.email))


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/auth/me", response_model=UserOut)
def update_me(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> User:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user
```

- [ ] **Step 5: Write `app/routers/admin.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import User
from app.schemas.user import UserCreate, UserOut
from app.seed import create_user

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_account(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> User:
    exists = db.scalars(select(User).where(User.email == payload.email)).first()
    if exists is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    return create_user(
        db, payload.email, payload.password, payload.display_name, is_admin=False
    )
```

- [ ] **Step 6: Update `app/main.py`** to include routers and bootstrap the admin

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import SessionLocal, create_db_and_tables
from app.routers import admin, auth
from app.seed import bootstrap_admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    db = SessionLocal()
    try:
        bootstrap_admin(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Golf Analytics API", lifespan=lifespan)
app.include_router(auth.router)
app.include_router(admin.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 7: Add auth fixtures to `tests/conftest.py`** (append to the file)

```python
from app.config import settings
from app.seed import bootstrap_admin


@pytest.fixture
def auth_headers(client, db_session):
    bootstrap_admin(db_session)
    resp = client.post(
        "/auth/login",
        data={"username": settings.admin_email, "password": settings.admin_password},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
```

- [ ] **Step 8: Write the failing test `tests/test_auth.py`**

```python
from app.config import settings


def test_login_succeeds_for_bootstrap_admin(client, db_session):
    from app.seed import bootstrap_admin

    bootstrap_admin(db_session)
    resp = client.post(
        "/auth/login",
        data={"username": settings.admin_email, "password": settings.admin_password},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_me_requires_auth(client):
    assert client.get("/auth/me").status_code == 401


def test_admin_creates_account(client, auth_headers):
    resp = client.post(
        "/admin/users",
        headers=auth_headers,
        json={"email": "friend@example.com", "password": "pw", "display_name": "Friend"},
    )
    assert resp.status_code == 201
    assert resp.json()["email"] == "friend@example.com"
    assert resp.json()["is_admin"] is False


def test_non_admin_cannot_create_account(client, auth_headers):
    client.post(
        "/admin/users",
        headers=auth_headers,
        json={"email": "friend@example.com", "password": "pw"},
    )
    login = client.post(
        "/auth/login", data={"username": "friend@example.com", "password": "pw"}
    )
    friend_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    resp = client.post(
        "/admin/users",
        headers=friend_headers,
        json={"email": "x@example.com", "password": "pw"},
    )
    assert resp.status_code == 403


def test_update_own_unit_preference(client, auth_headers):
    resp = client.patch(
        "/auth/me", headers=auth_headers, json={"unit_preference": "meters"}
    )
    assert resp.status_code == 200
    assert resp.json()["unit_preference"] == "meters"
```

- [ ] **Step 9: Run the tests**

Run: `pytest tests/test_auth.py -v`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/
git commit -m "Add auth, bootstrap admin, and admin-created accounts"
```

---

### Task 5: Club model + standard-bag seeding

**Files:**
- Create: `backend/app/models/club.py`
- Modify: `backend/app/models/__init__.py` (export `Club`)
- Create: `backend/app/standard_bag.py`
- Modify: `backend/app/seed.py` (seed bag inside `create_user`)
- Test: `backend/tests/test_standard_bag.py`

**Interfaces:**
- Produces model `Club(id, user_id, label, category, order_index, loft:float|None, brand_model:str|None, is_active:bool)`.
- Produces `standard_bag.STANDARD_BAG: list[dict]` and `seed.seed_standard_bag(db, user_id) -> None`, called automatically by `create_user`.

- [ ] **Step 1: Write `app/models/club.py`**

```python
from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Club(Base):
    __tablename__ = "clubs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )
    label: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    loft: Mapped[float | None] = mapped_column(Float, nullable=True)
    brand_model: Mapped[str | None] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
```

- [ ] **Step 2: Export in `app/models/__init__.py`**

```python
from app.models.club import Club
from app.models.user import User

__all__ = ["User", "Club"]
```

- [ ] **Step 3: Write `app/standard_bag.py`**

```python
# Default bag seeded for every new user. order_index runs longest→shortest club.
STANDARD_BAG: list[dict] = [
    {"label": "Driver", "category": "wood"},
    {"label": "3 Wood", "category": "wood"},
    {"label": "5 Wood", "category": "wood"},
    {"label": "4 Hybrid", "category": "hybrid"},
    {"label": "5 Iron", "category": "iron"},
    {"label": "6 Iron", "category": "iron"},
    {"label": "7 Iron", "category": "iron"},
    {"label": "8 Iron", "category": "iron"},
    {"label": "9 Iron", "category": "iron"},
    {"label": "Pitching Wedge", "category": "wedge"},
    {"label": "Gap Wedge", "category": "wedge"},
    {"label": "Sand Wedge", "category": "wedge"},
    {"label": "Lob Wedge", "category": "wedge"},
    {"label": "Putter", "category": "putter"},
]
```

- [ ] **Step 4: Add seeding to `app/seed.py`** — add this function and call it from `create_user` before returning.

Add the import at the top: `from app.models import Club` (extend the existing `from app.models import User` line to `from app.models import Club, User`). Add:

```python
from app.standard_bag import STANDARD_BAG


def seed_standard_bag(db: Session, user_id: int) -> None:
    for i, spec in enumerate(STANDARD_BAG):
        db.add(
            Club(
                user_id=user_id,
                label=spec["label"],
                category=spec["category"],
                order_index=i,
            )
        )
    db.commit()
```

In `create_user`, immediately before `return user`, add:

```python
    seed_standard_bag(db, user.id)
```

- [ ] **Step 5: Write the failing test `tests/test_standard_bag.py`**

```python
from sqlalchemy import select

from app.models import Club
from app.seed import create_user
from app.standard_bag import STANDARD_BAG


def test_new_user_gets_standard_bag(db_session):
    user = create_user(db_session, "golfer@example.com", "pw")
    clubs = db_session.scalars(
        select(Club).where(Club.user_id == user.id).order_by(Club.order_index)
    ).all()
    assert len(clubs) == len(STANDARD_BAG)
    assert clubs[0].label == "Driver"
    assert clubs[0].order_index == 0
```

- [ ] **Step 6: Run to verify fail, then pass**

Run: `pytest tests/test_standard_bag.py -v`
Expected: PASS after Step 4 is in place (run before Step 4 to see it fail on the missing bag).

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "Add Club model and standard-bag seeding"
```

---

### Task 6: Bag (Club) CRUD endpoints

**Files:**
- Create: `backend/app/schemas/club.py`
- Create: `backend/app/routers/clubs.py`
- Modify: `backend/app/main.py` (include router)
- Test: `backend/tests/test_clubs.py`

**Interfaces:**
- Consumes: `Club`, `get_current_user`, `get_db`.
- Produces endpoints (all scoped to current user): `GET /clubs`, `POST /clubs`, `PATCH /clubs/{id}`, `DELETE /clubs/{id}`.
- Produces schema `ClubOut(id, label, category, order_index, loft, brand_model, is_active)`.

- [ ] **Step 1: Write `app/schemas/club.py`**

```python
from pydantic import BaseModel, ConfigDict


class ClubOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    category: str
    order_index: int
    loft: float | None
    brand_model: str | None
    is_active: bool


class ClubCreate(BaseModel):
    label: str
    category: str
    order_index: int = 0
    loft: float | None = None
    brand_model: str | None = None


class ClubUpdate(BaseModel):
    label: str | None = None
    category: str | None = None
    order_index: int | None = None
    loft: float | None = None
    brand_model: str | None = None
    is_active: bool | None = None
```

- [ ] **Step 2: Write `app/routers/clubs.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Club, User
from app.schemas.club import ClubCreate, ClubOut, ClubUpdate

router = APIRouter(prefix="/clubs", tags=["clubs"])


def _owned_club(db: Session, club_id: int, user: User) -> Club:
    club = db.get(Club, club_id)
    if club is None or club.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Club not found")
    return club


@router.get("", response_model=list[ClubOut])
def list_clubs(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Club]:
    return list(
        db.scalars(
            select(Club).where(Club.user_id == user.id).order_by(Club.order_index)
        ).all()
    )


@router.post("", response_model=ClubOut, status_code=status.HTTP_201_CREATED)
def create_club(
    payload: ClubCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Club:
    club = Club(user_id=user.id, **payload.model_dump())
    db.add(club)
    db.commit()
    db.refresh(club)
    return club


@router.patch("/{club_id}", response_model=ClubOut)
def update_club(
    club_id: int,
    payload: ClubUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Club:
    club = _owned_club(db, club_id, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(club, field, value)
    db.commit()
    db.refresh(club)
    return club


@router.delete("/{club_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_club(
    club_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    club = _owned_club(db, club_id, user)
    db.delete(club)
    db.commit()
```

- [ ] **Step 3: Include the router in `app/main.py`**

Add `clubs` to the import (`from app.routers import admin, auth, clubs`) and add `app.include_router(clubs.router)` beside the others.

- [ ] **Step 4: Write the failing test `tests/test_clubs.py`**

```python
def test_bag_listed_for_admin(client, auth_headers):
    resp = client.get("/clubs", headers=auth_headers)
    assert resp.status_code == 200
    labels = [c["label"] for c in resp.json()]
    assert "Driver" in labels


def test_create_update_delete_club(client, auth_headers):
    created = client.post(
        "/clubs",
        headers=auth_headers,
        json={"label": "60° Lob", "category": "wedge", "order_index": 99},
    )
    assert created.status_code == 201
    club_id = created.json()["id"]

    updated = client.patch(
        f"/clubs/{club_id}", headers=auth_headers, json={"label": "60° LW"}
    )
    assert updated.json()["label"] == "60° LW"

    assert client.delete(f"/clubs/{club_id}", headers=auth_headers).status_code == 204


def test_cannot_touch_other_users_club(client, auth_headers):
    client.post(
        "/admin/users",
        headers=auth_headers,
        json={"email": "friend@example.com", "password": "pw"},
    )
    login = client.post(
        "/auth/login", data={"username": "friend@example.com", "password": "pw"}
    )
    friend_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    friend_club = client.get("/clubs", headers=friend_headers).json()[0]["id"]
    resp = client.patch(
        f"/clubs/{friend_club}", headers=auth_headers, json={"label": "hijack"}
    )
    assert resp.status_code == 404
```

- [ ] **Step 5: Run the tests**

Run: `pytest tests/test_clubs.py -v`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "Add club bag CRUD endpoints"
```

---

### Task 7: RangeSession model + CRUD endpoints

**Files:**
- Create: `backend/app/models/range_session.py`
- Modify: `backend/app/models/__init__.py` (export `RangeSession`)
- Create: `backend/app/schemas/session.py`
- Create: `backend/app/routers/sessions.py`
- Modify: `backend/app/main.py` (include router)
- Test: `backend/tests/test_sessions.py`

**Interfaces:**
- Produces model `RangeSession(id, user_id, date:date, name:str|None, surface:str|None, wind:str|None, temperature:float|None, notes:str|None, created_at)`.
- Produces endpoints (scoped to user): `GET /sessions`, `POST /sessions`, `GET /sessions/{id}`, `PATCH /sessions/{id}`, `DELETE /sessions/{id}`.
- Produces helper `_owned_session(db, session_id, user) -> RangeSession` (reused by Task 8).

- [ ] **Step 1: Write `app/models/range_session.py`**

```python
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RangeSession(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    surface: Mapped[str | None] = mapped_column(String, nullable=True)
    wind: Mapped[str | None] = mapped_column(String, nullable=True)
    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
```

- [ ] **Step 2: Export in `app/models/__init__.py`**

```python
from app.models.club import Club
from app.models.range_session import RangeSession
from app.models.user import User

__all__ = ["User", "Club", "RangeSession"]
```

- [ ] **Step 3: Write `app/schemas/session.py`**

```python
from datetime import date as date_type

from pydantic import BaseModel, ConfigDict


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: date_type
    name: str | None
    surface: str | None
    wind: str | None
    temperature: float | None
    notes: str | None


class SessionCreate(BaseModel):
    date: date_type
    name: str | None = None
    surface: str | None = None
    wind: str | None = None
    temperature: float | None = None
    notes: str | None = None


class SessionUpdate(BaseModel):
    date: date_type | None = None
    name: str | None = None
    surface: str | None = None
    wind: str | None = None
    temperature: float | None = None
    notes: str | None = None
```

- [ ] **Step 4: Write `app/routers/sessions.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import RangeSession, User
from app.schemas.session import SessionCreate, SessionOut, SessionUpdate

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _owned_session(db: Session, session_id: int, user: User) -> RangeSession:
    rs = db.get(RangeSession, session_id)
    if rs is None or rs.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return rs


@router.get("", response_model=list[SessionOut])
def list_sessions(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[RangeSession]:
    return list(
        db.scalars(
            select(RangeSession)
            .where(RangeSession.user_id == user.id)
            .order_by(RangeSession.date.desc(), RangeSession.id.desc())
        ).all()
    )


@router.post("", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: SessionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RangeSession:
    rs = RangeSession(user_id=user.id, **payload.model_dump())
    db.add(rs)
    db.commit()
    db.refresh(rs)
    return rs


@router.get("/{session_id}", response_model=SessionOut)
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RangeSession:
    return _owned_session(db, session_id, user)


@router.patch("/{session_id}", response_model=SessionOut)
def update_session(
    session_id: int,
    payload: SessionUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RangeSession:
    rs = _owned_session(db, session_id, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rs, field, value)
    db.commit()
    db.refresh(rs)
    return rs


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    rs = _owned_session(db, session_id, user)
    db.delete(rs)
    db.commit()
```

- [ ] **Step 5: Include the router in `app/main.py`**

Add `sessions` to the import and `app.include_router(sessions.router)`.

- [ ] **Step 6: Write the failing test `tests/test_sessions.py`**

```python
def test_create_and_list_session(client, auth_headers):
    created = client.post(
        "/sessions",
        headers=auth_headers,
        json={"date": "2026-06-19", "surface": "grass"},
    )
    assert created.status_code == 201
    sid = created.json()["id"]

    listed = client.get("/sessions", headers=auth_headers)
    assert any(s["id"] == sid for s in listed.json())


def test_get_missing_session_404(client, auth_headers):
    assert client.get("/sessions/999", headers=auth_headers).status_code == 404
```

- [ ] **Step 7: Run the tests**

Run: `pytest tests/test_sessions.py -v`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/
git commit -m "Add range session CRUD endpoints"
```

---

### Task 8: Shot model + manual logging endpoints

**Files:**
- Create: `backend/app/models/shot.py`
- Modify: `backend/app/models/__init__.py` (export `Shot`)
- Create: `backend/app/schemas/shot.py`
- Create: `backend/app/routers/shots.py`
- Modify: `backend/app/main.py` (include router)
- Test: `backend/tests/test_shots.py`

**Interfaces:**
- Produces model `Shot(id, session_id, club_id, carry_yards:float, total_yards:float|None, direction:str, source:str, accuracy:str|None, created_at)`.
- Produces endpoints: `POST /sessions/{session_id}/shots` (create, validates club+session ownership), `GET /sessions/{session_id}/shots` (list for a session), `PATCH /shots/{id}` (edit), `DELETE /shots/{id}`.
- Validates `direction ∈ {left,straight,right}` and defaults `source="manual"`.

- [ ] **Step 1: Write `app/models/shot.py`**

```python
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Shot(Base):
    __tablename__ = "shots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id"), index=True, nullable=False
    )
    club_id: Mapped[int] = mapped_column(
        ForeignKey("clubs.id"), index=True, nullable=False
    )
    carry_yards: Mapped[float] = mapped_column(Float, nullable=False)
    total_yards: Mapped[float | None] = mapped_column(Float, nullable=True)
    direction: Mapped[str] = mapped_column(String, nullable=False, default="straight")
    source: Mapped[str] = mapped_column(String, nullable=False, default="manual")
    accuracy: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
```

- [ ] **Step 2: Export in `app/models/__init__.py`**

```python
from app.models.club import Club
from app.models.range_session import RangeSession
from app.models.shot import Shot
from app.models.user import User

__all__ = ["User", "Club", "RangeSession", "Shot"]
```

- [ ] **Step 3: Write `app/schemas/shot.py`**

```python
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

Direction = Literal["left", "straight", "right"]


class ShotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    club_id: int
    carry_yards: float
    total_yards: float | None
    direction: Direction
    source: str
    created_at: datetime


class ShotCreate(BaseModel):
    club_id: int
    carry_yards: float
    total_yards: float | None = None
    direction: Direction = "straight"
    source: str = "manual"


class ShotUpdate(BaseModel):
    club_id: int | None = None
    carry_yards: float | None = None
    total_yards: float | None = None
    direction: Direction | None = None
```

- [ ] **Step 4: Write `app/routers/shots.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Club, Shot, User
from app.routers.sessions import _owned_session
from app.schemas.shot import ShotCreate, ShotOut, ShotUpdate

router = APIRouter(tags=["shots"])


@router.post(
    "/sessions/{session_id}/shots",
    response_model=ShotOut,
    status_code=status.HTTP_201_CREATED,
)
def create_shot(
    session_id: int,
    payload: ShotCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Shot:
    _owned_session(db, session_id, user)
    club = db.get(Club, payload.club_id)
    if club is None or club.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Club not found")
    shot = Shot(session_id=session_id, **payload.model_dump())
    db.add(shot)
    db.commit()
    db.refresh(shot)
    return shot


@router.get("/sessions/{session_id}/shots", response_model=list[ShotOut])
def list_shots(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Shot]:
    _owned_session(db, session_id, user)
    return list(
        db.scalars(
            select(Shot).where(Shot.session_id == session_id).order_by(Shot.id)
        ).all()
    )


@router.patch("/shots/{shot_id}", response_model=ShotOut)
def update_shot(
    shot_id: int,
    payload: ShotUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Shot:
    shot = db.get(Shot, shot_id)
    if shot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shot not found")
    _owned_session(db, shot.session_id, user)  # ownership via parent session
    data = payload.model_dump(exclude_unset=True)
    if "club_id" in data:
        club = db.get(Club, data["club_id"])
        if club is None or club.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Club not found")
    for field, value in data.items():
        setattr(shot, field, value)
    db.commit()
    db.refresh(shot)
    return shot


@router.delete("/shots/{shot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shot(
    shot_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    shot = db.get(Shot, shot_id)
    if shot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shot not found")
    _owned_session(db, shot.session_id, user)  # verifies ownership via session
    db.delete(shot)
    db.commit()
```

- [ ] **Step 5: Include the router in `app/main.py`**

Add `shots` to the import and `app.include_router(shots.router)`.

- [ ] **Step 6: Write the failing test `tests/test_shots.py`**

```python
def _make_session(client, headers):
    return client.post(
        "/sessions", headers=headers, json={"date": "2026-06-19"}
    ).json()["id"]


def _first_club_id(client, headers):
    return client.get("/clubs", headers=headers).json()[0]["id"]


def test_log_and_list_shots(client, auth_headers):
    sid = _make_session(client, auth_headers)
    club_id = _first_club_id(client, auth_headers)
    resp = client.post(
        f"/sessions/{sid}/shots",
        headers=auth_headers,
        json={"club_id": club_id, "carry_yards": 250.0, "direction": "left"},
    )
    assert resp.status_code == 201
    assert resp.json()["source"] == "manual"

    shots = client.get(f"/sessions/{sid}/shots", headers=auth_headers).json()
    assert len(shots) == 1
    assert shots[0]["carry_yards"] == 250.0


def test_reject_bad_direction(client, auth_headers):
    sid = _make_session(client, auth_headers)
    club_id = _first_club_id(client, auth_headers)
    resp = client.post(
        f"/sessions/{sid}/shots",
        headers=auth_headers,
        json={"club_id": club_id, "carry_yards": 100.0, "direction": "sideways"},
    )
    assert resp.status_code == 422


def test_edit_shot(client, auth_headers):
    sid = _make_session(client, auth_headers)
    club_id = _first_club_id(client, auth_headers)
    shot_id = client.post(
        f"/sessions/{sid}/shots",
        headers=auth_headers,
        json={"club_id": club_id, "carry_yards": 100.0},
    ).json()["id"]
    resp = client.patch(
        f"/shots/{shot_id}", headers=auth_headers, json={"carry_yards": 142.0}
    )
    assert resp.status_code == 200
    assert resp.json()["carry_yards"] == 142.0
```

- [ ] **Step 7: Run the tests**

Run: `pytest tests/test_shots.py -v`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/
git commit -m "Add shot model and manual logging endpoints"
```

---

### Task 9: Stats engine (pure functions) — TDD centerpiece

**Files:**
- Create: `backend/app/stats/__init__.py` (empty)
- Create: `backend/app/stats/engine.py`
- Test: `backend/tests/test_stats_engine.py`

**Interfaces:**
- Produces `compute_club_stats(shots: list[dict]) -> dict` where each shot is `{"carry_yards": float, "direction": str}`. Returns `{count, avg_carry, median_carry, consistency, min_carry, max_carry, direction: {left, straight, right}}`. Empty input → `count=0` and `None` numeric fields.
- Produces `compute_gapping(clubs: list[dict]) -> list[dict]` where each input is `{"club_id": int, "label": str, "avg_carry": float|None}`. Returns clubs with `avg_carry is not None`, sorted by `avg_carry` descending, each with added `gap_to_next: float|None` (None for the shortest club).

- [ ] **Step 1: Write the failing test `tests/test_stats_engine.py`**

```python
from app.stats.engine import compute_club_stats, compute_gapping


def test_club_stats_basic():
    shots = [
        {"carry_yards": 150.0, "direction": "left"},
        {"carry_yards": 160.0, "direction": "straight"},
        {"carry_yards": 170.0, "direction": "right"},
    ]
    s = compute_club_stats(shots)
    assert s["count"] == 3
    assert s["avg_carry"] == 160.0
    assert s["median_carry"] == 160.0
    assert s["min_carry"] == 150.0
    assert s["max_carry"] == 170.0
    assert s["direction"] == {"left": 1, "straight": 1, "right": 1}


def test_club_stats_empty():
    s = compute_club_stats([])
    assert s["count"] == 0
    assert s["avg_carry"] is None
    assert s["direction"] == {"left": 0, "straight": 0, "right": 0}


def test_gapping_orders_and_computes_gap():
    clubs = [
        {"club_id": 1, "label": "7 Iron", "avg_carry": 150.0},
        {"club_id": 2, "label": "Driver", "avg_carry": 250.0},
        {"club_id": 3, "label": "8 Iron", "avg_carry": 140.0},
        {"club_id": 4, "label": "New Wedge", "avg_carry": None},
    ]
    rows = compute_gapping(clubs)
    assert [r["label"] for r in rows] == ["Driver", "7 Iron", "8 Iron"]
    assert rows[0]["gap_to_next"] == 100.0  # 250 - 150
    assert rows[1]["gap_to_next"] == 10.0   # 150 - 140
    assert rows[2]["gap_to_next"] is None
```

- [ ] **Step 2: Run to verify it fails**

Run: `pytest tests/test_stats_engine.py -v`
Expected: FAIL (`ModuleNotFoundError: app.stats.engine`).

- [ ] **Step 3: Write `app/stats/engine.py`**

```python
import pandas as pd


def compute_club_stats(shots: list[dict]) -> dict:
    if not shots:
        return {
            "count": 0,
            "avg_carry": None,
            "median_carry": None,
            "consistency": None,
            "min_carry": None,
            "max_carry": None,
            "direction": {"left": 0, "straight": 0, "right": 0},
        }
    df = pd.DataFrame(shots)
    carry = df["carry_yards"]
    return {
        "count": int(len(df)),
        "avg_carry": round(float(carry.mean()), 1),
        "median_carry": round(float(carry.median()), 1),
        "consistency": round(float(carry.std(ddof=0)), 1),
        "min_carry": float(carry.min()),
        "max_carry": float(carry.max()),
        "direction": {
            "left": int((df["direction"] == "left").sum()),
            "straight": int((df["direction"] == "straight").sum()),
            "right": int((df["direction"] == "right").sum()),
        },
    }


def compute_gapping(clubs: list[dict]) -> list[dict]:
    ranked = sorted(
        (c for c in clubs if c.get("avg_carry") is not None),
        key=lambda c: c["avg_carry"],
        reverse=True,
    )
    rows: list[dict] = []
    for i, club in enumerate(ranked):
        gap = None
        if i + 1 < len(ranked):
            gap = round(club["avg_carry"] - ranked[i + 1]["avg_carry"], 1)
        rows.append({**club, "gap_to_next": gap})
    return rows
```

- [ ] **Step 4: Run to verify it passes**

Run: `pytest tests/test_stats_engine.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "Add derived stats engine"
```

---

### Task 10: Stats + dashboard endpoints (wire engine to DB)

**Files:**
- Create: `backend/app/schemas/stats.py`
- Create: `backend/app/routers/stats.py`
- Modify: `backend/app/main.py` (include router)
- Test: `backend/tests/test_stats_api.py`

**Interfaces:**
- Consumes: `compute_club_stats`, `compute_gapping`, `Club`, `Shot`, `RangeSession`.
- Produces endpoints (scoped to user): `GET /clubs/{club_id}/stats` → one club's stats; `GET /stats/gapping` → gapping rows across the bag; `GET /stats/dashboard` → `{clubs: [{club_id,label,category,order_index, stats}], gapping: [...] }`.
- Stats query: a club's shots are those whose `club_id` matches and whose session belongs to the user.

- [ ] **Step 1: Write `app/schemas/stats.py`**

```python
from pydantic import BaseModel


class DirectionSplit(BaseModel):
    left: int
    straight: int
    right: int


class ClubStats(BaseModel):
    count: int
    avg_carry: float | None
    median_carry: float | None
    consistency: float | None
    min_carry: float | None
    max_carry: float | None
    direction: DirectionSplit


class GapRow(BaseModel):
    club_id: int
    label: str
    avg_carry: float | None
    gap_to_next: float | None


class DashboardClub(BaseModel):
    club_id: int
    label: str
    category: str
    order_index: int
    stats: ClubStats


class Dashboard(BaseModel):
    clubs: list[DashboardClub]
    gapping: list[GapRow]
```

- [ ] **Step 2: Write `app/routers/stats.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Club, RangeSession, Shot, User
from app.schemas.stats import ClubStats, Dashboard, GapRow
from app.stats.engine import compute_club_stats, compute_gapping

router = APIRouter(tags=["stats"])


def _shots_for_club(db: Session, club_id: int, user_id: int) -> list[dict]:
    rows = db.execute(
        select(Shot.carry_yards, Shot.direction)
        .join(RangeSession, Shot.session_id == RangeSession.id)
        .where(Shot.club_id == club_id, RangeSession.user_id == user_id)
    ).all()
    return [{"carry_yards": r.carry_yards, "direction": r.direction} for r in rows]


@router.get("/clubs/{club_id}/stats", response_model=ClubStats)
def club_stats(
    club_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    club = db.get(Club, club_id)
    if club is None or club.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Club not found")
    return compute_club_stats(_shots_for_club(db, club_id, user.id))


def _gapping_rows(db: Session, user_id: int) -> list[dict]:
    clubs = db.scalars(
        select(Club).where(Club.user_id == user_id, Club.is_active.is_(True))
    ).all()
    enriched = []
    for club in clubs:
        stats = compute_club_stats(_shots_for_club(db, club.id, user_id))
        enriched.append(
            {"club_id": club.id, "label": club.label, "avg_carry": stats["avg_carry"]}
        )
    return compute_gapping(enriched)


@router.get("/stats/gapping", response_model=list[GapRow])
def gapping(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[dict]:
    return _gapping_rows(db, user.id)


@router.get("/stats/dashboard", response_model=Dashboard)
def dashboard(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    clubs = db.scalars(
        select(Club)
        .where(Club.user_id == user.id, Club.is_active.is_(True))
        .order_by(Club.order_index)
    ).all()
    club_blocks = [
        {
            "club_id": c.id,
            "label": c.label,
            "category": c.category,
            "order_index": c.order_index,
            "stats": compute_club_stats(_shots_for_club(db, c.id, user.id)),
        }
        for c in clubs
    ]
    return {"clubs": club_blocks, "gapping": _gapping_rows(db, user.id)}
```

- [ ] **Step 3: Include the router in `app/main.py`**

Add `stats` to the import and `app.include_router(stats.router)`.

- [ ] **Step 4: Write the failing test `tests/test_stats_api.py`**

```python
def _setup_shots(client, headers, carries):
    sid = client.post("/sessions", headers=headers, json={"date": "2026-06-19"}).json()[
        "id"
    ]
    club_id = client.get("/clubs", headers=headers).json()[0]["id"]
    for c in carries:
        client.post(
            f"/sessions/{sid}/shots",
            headers=headers,
            json={"club_id": club_id, "carry_yards": c, "direction": "straight"},
        )
    return club_id


def test_club_stats_endpoint(client, auth_headers):
    club_id = _setup_shots(client, auth_headers, [200.0, 210.0, 220.0])
    resp = client.get(f"/clubs/{club_id}/stats", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["count"] == 3
    assert resp.json()["avg_carry"] == 210.0


def test_dashboard_endpoint(client, auth_headers):
    _setup_shots(client, auth_headers, [200.0, 210.0])
    resp = client.get("/stats/dashboard", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "clubs" in body and "gapping" in body
    assert any(c["stats"]["count"] == 2 for c in body["clubs"])
```

- [ ] **Step 5: Run the tests**

Run: `pytest tests/test_stats_api.py -v`
Expected: all PASS.

- [ ] **Step 6: Run the full suite**

Run: `pytest -v`
Expected: every test PASSES.

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "Add stats and dashboard endpoints"
```

---

### Task 11: Docker packaging + README

**Files:**
- Create: `backend/Dockerfile`
- Create: `docker-compose.yml` (repo root)
- Create: `backend/.env.example`
- Create: `README.md` (repo root)

**Interfaces:**
- Produces a one-command self-host: `docker compose up` serves the API on `:8000`, reading `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`SECRET_KEY` from env.

- [ ] **Step 1: Write `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Write `docker-compose.yml`** (repo root)

```yaml
services:
  api:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      SECRET_KEY: ${SECRET_KEY:-dev-secret-change-me}
      ADMIN_EMAIL: ${ADMIN_EMAIL:-admin@example.com}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:-changeme}
      DATABASE_URL: sqlite:////data/golf.db
    volumes:
      - golf-data:/data

volumes:
  golf-data:
```

- [ ] **Step 3: Write `backend/.env.example`**

```dotenv
SECRET_KEY=change-me-to-a-long-random-string
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=pick-a-strong-password
DATABASE_URL=sqlite:///./golf.db
```

- [ ] **Step 4: Write `README.md`** (repo root)

```markdown
# Golf Analytics

Self-hosted, open-source golf analytics. v1: club & shot analysis (range engine).

## Run with Docker

    cp backend/.env.example .env   # edit the values
    docker compose up --build

API runs at http://localhost:8000 — interactive docs at /docs.
The first run creates an admin account from ADMIN_EMAIL / ADMIN_PASSWORD.

## Develop the backend

    cd backend
    pip install -e ".[dev]"
    pytest
    uvicorn app.main:app --reload

## Status

v1 backend (this plan): accounts, bag, sessions, manual shot logging, derived stats.
Roadmap: React frontend, launch-monitor import, GPS shots, on-course/OSM, scores/handicap.
```

- [ ] **Step 5: Verify the container builds and serves**

Run (from repo root): `docker compose up --build -d && sleep 5 && curl -s localhost:8000/health`
Expected: `{"status":"ok"}`. Then `docker compose down`.

- [ ] **Step 6: Commit**

```bash
git add backend/Dockerfile docker-compose.yml backend/.env.example README.md
git commit -m "Add Docker packaging and README"
```

---

## Notes for the next plan (Frontend — Plan 2)

The API surface this plan produces, for the React client to consume:
- `POST /auth/login` (form) → `{access_token}`; `GET /auth/me`; `PATCH /auth/me` (display name, unit preference).
- `GET/POST /clubs`, `PATCH/DELETE /clubs/{id}`.
- `GET/POST /sessions`, `GET/PATCH/DELETE /sessions/{id}`.
- `POST /sessions/{id}/shots`, `GET /sessions/{id}/shots`, `PATCH /shots/{id}`, `DELETE /shots/{id}`.
- `GET /clubs/{id}/stats`, `GET /stats/gapping`, `GET /stats/dashboard`.
- `POST /admin/users` (admin only).

Screens to build against it: Log entry, My Bag, Club detail, Gapping, Session history, Dashboard.
