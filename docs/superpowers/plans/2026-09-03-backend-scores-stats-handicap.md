# Pillar 3 Backend — Scores, Round Stats & Handicap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tee ratings, per-hole stat detail, backlog rounds, derived round statistics and a WHS Handicap Index to the backend.

**Architecture:** All handicap logic is pure functions in `app/stats/handicap/`, with ordering knowledge confined to `history.py`. Nothing derived is persisted — `GET /stats/handicap` replays the player's rounds chronologically on each request (spec §2.5, Approach A). Rating/slope/par are snapshotted onto `Round` at creation so re-rating a course cannot rewrite history.

**Tech Stack:** FastAPI, Pydantic v2, SQLAlchemy 2.0 (typed `Mapped`), Alembic, pytest + httpx TestClient. Python ≥3.12. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-03-scores-stats-handicap-design.md`

## Global Constraints

- Distances are canonically **yards** (float). Never store meters.
- **Stats are derived, never stored.** No aggregate columns, no cache.
- **Per-user isolation.** Every query filters by `current_user`; round ownership is checked before any hole or shot access.
- **Schema changes go through Alembic.** Verify each migration against a fresh DB *and* on top of the existing chain.
- All API routes live under `/api` on the `api` sub-app (`app/main.py`). Tests must override `get_db` on both `app` and `api` — the existing `client` fixture already does.
- **TDD for the stats engine** — failing test first, per `tests/test_stats_engine.py`.
- Every WHS constant is cited to a rule number in spec §7. Do not "improve" a constant; if one looks wrong, stop and raise it.
- Enums are string-validated. New values this slice: `Round.status` gains `abandoned`; `TeeRating.scope ∈ {18, front9, back9}`; `Round.nine ∈ {front, back}`.
- Handicap Index maximum is **54.0** (Rule 5.3).
- PCC is fixed at `0` but must remain an explicit parameter on differential functions (spec §2.6).

---

## File Structure

**Create:**
- `app/models/tee.py` — `TeeSet`, `TeeRating`
- `app/schemas/tee.py` — tee/rating in/out schemas
- `app/routers/tees.py` — tee + rating + stroke-index endpoints
- `app/stats/handicap/__init__.py` — re-exports the public surface
- `app/stats/handicap/strokes.py` — stroke allocation and hole-score caps
- `app/stats/handicap/differential.py` — AGS, score differentials, rounding
- `app/stats/handicap/index.py` — Index from differentials, caps, course handicap
- `app/stats/handicap/history.py` — the chronological walk (the only ordering-aware module)
- `app/stats/round_stats.py` — GIR, fairways, putts, scrambling
- `tests/test_handicap_strokes.py`, `tests/test_handicap_differential.py`, `tests/test_handicap_index.py`, `tests/test_handicap_history.py`, `tests/test_round_stats.py`, `tests/test_tees.py`, `tests/test_stats_handicap_api.py`

**Modify:**
- `app/models/course.py` — `Hole.stroke_index`
- `app/models/round.py` — `Round` scope/snapshot columns; `RoundHole` stat columns
- `app/models/__init__.py` — register `TeeSet`, `TeeRating`
- `app/schemas/round.py` — round create/patch/out additions
- `app/schemas/stats.py` — handicap + round-stat response models
- `app/routers/rounds.py` — tee selection, snapshot, backlog creation, stat fields, `/rounds/{id}/stats`
- `app/routers/stats.py` — `/stats/handicap`, `/stats/rounds`
- `app/main.py` — include the tees router

---

## Task 1: Schema — tee ratings, stroke index, round scope and stat columns

**Files:**
- Create: `backend/app/models/tee.py`
- Modify: `backend/app/models/course.py`, `backend/app/models/round.py`, `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/<rev>_add_tees_ratings_and_round_stats.py`
- Test: `backend/tests/test_tees.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `TeeSet(id, course_id, name, yardage)`; `TeeRating(id, tee_set_id, scope, course_rating, slope_rating, par)` with `scope ∈ {"18","front9","back9"}` unique per tee; `Hole.stroke_index: int | None`; `Round.tee_set_id/hole_count/nine/course_rating/slope_rating/course_par`; `RoundHole.fairway_hit/putts/penalties`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_tees.py
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
        user_id=user.id, course_id=course.id, date="2026-09-01",
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
```

Add this fixture to `backend/tests/conftest.py`:

```python
@pytest.fixture
def seeded_user_and_course(db_session):
    """A user, an 18-hole course with par-4 holes and stroke indexes 1..18,
    and a Blue tee rated for 18 / front9 / back9."""
    from app.models import Course, Hole, TeeRating, TeeSet
    from app.seed import bootstrap_admin

    user = bootstrap_admin(db_session)
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
```

If `bootstrap_admin` does not return the user, fetch it after the call with `db_session.query(User).filter_by(email=settings.admin_email).one()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_tees.py -v`
Expected: FAIL — `ImportError: cannot import name 'TeeSet' from 'app.models'`

- [ ] **Step 3: Write the models**

```python
# backend/app/models/tee.py
from sqlalchemy import Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TeeSet(Base):
    __tablename__ = "tee_sets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    yardage: Mapped[int | None] = mapped_column(Integer, nullable=True)

    ratings: Mapped[list["TeeRating"]] = relationship(
        back_populates="tee_set", cascade="all, delete-orphan"
    )


class TeeRating(Base):
    __tablename__ = "tee_ratings"
    __table_args__ = (UniqueConstraint("tee_set_id", "scope", name="uq_tee_rating_scope"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tee_set_id: Mapped[int] = mapped_column(
        ForeignKey("tee_sets.id"), index=True, nullable=False
    )
    # "18" | "front9" | "back9"
    scope: Mapped[str] = mapped_column(String, nullable=False)
    course_rating: Mapped[float] = mapped_column(Float, nullable=False)
    slope_rating: Mapped[int] = mapped_column(Integer, nullable=False)
    par: Mapped[int] = mapped_column(Integer, nullable=False)

    tee_set: Mapped["TeeSet"] = relationship(back_populates="ratings")
```

In `app/models/course.py`, add to `Hole`:

```python
    stroke_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
```

In `app/models/round.py`, add to `Round`:

```python
    tee_set_id: Mapped[int | None] = mapped_column(
        ForeignKey("tee_sets.id"), nullable=True
    )
    hole_count: Mapped[int] = mapped_column(Integer, nullable=False, default=18)
    nine: Mapped[str | None] = mapped_column(String, nullable=True)  # "front" | "back"
    # Snapshotted from the applicable TeeRating at creation; never read live.
    course_rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    slope_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    course_par: Mapped[int | None] = mapped_column(Integer, nullable=True)
```

and to `RoundHole`:

```python
    fairway_hit: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    putts: Mapped[int | None] = mapped_column(Integer, nullable=True)
    penalties: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
```

`Round` and `RoundHole` currently have **no ORM relationships** — `_round_out`
in `routers/rounds.py:30` joins manually. Later tasks read `r.holes` and
`rh.hole`, so add them now (no migration needed; relationships are not
columns):

```python
# on Round
    holes: Mapped[list["RoundHole"]] = relationship(
        back_populates="round", cascade="all, delete-orphan"
    )

# on RoundHole
    round: Mapped["Round"] = relationship(back_populates="holes")
    hole: Mapped["Hole"] = relationship()
```

Import `relationship` from `sqlalchemy.orm`. Leave `_round_out`'s explicit
join alone — it orders by hole number, which the relationship does not
guarantee. Anywhere order matters, sort explicitly.

Import `Boolean` and `Float` from `sqlalchemy` in `round.py` if not already present. Register in `app/models/__init__.py`:

```python
from app.models.tee import TeeRating, TeeSet

__all__ = [
    "User", "Club", "RangeSession", "Shot",
    "Course", "Hole", "Round", "RoundHole",
    "TeeSet", "TeeRating",
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_tees.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Generate and review the migration**

```bash
cd backend
.venv/bin/alembic revision --autogenerate -m "add tees, ratings, stroke index and round stat columns"
```

Open the generated file. Autogenerate emits `nullable=False` columns without server defaults, which fails on a non-empty table. Fix `rounds.hole_count` and `round_holes.penalties` to carry a server default:

```python
op.add_column('rounds', sa.Column('hole_count', sa.Integer(), nullable=False, server_default='18'))
op.add_column('round_holes', sa.Column('penalties', sa.Integer(), nullable=False, server_default='0'))
```

SQLite cannot `ALTER COLUMN`, so leave every other added column nullable — they already are.

- [ ] **Step 6: Verify the migration on a fresh DB and on the existing chain**

```bash
cd backend
rm -f /tmp/fresh.db
DATABASE_URL=sqlite:////tmp/fresh.db .venv/bin/alembic upgrade head
DATABASE_URL=sqlite:////tmp/fresh.db .venv/bin/alembic downgrade -1
DATABASE_URL=sqlite:////tmp/fresh.db .venv/bin/alembic upgrade head
```

Expected: all three succeed with no error. Then confirm the chain has five revisions:

```bash
.venv/bin/alembic history | wc -l
```

- [ ] **Step 7: Run the full suite and commit**

```bash
cd backend && .venv/bin/pytest -q
git add backend/app/models backend/alembic/versions backend/tests/test_tees.py backend/tests/conftest.py
git commit -m "Add tee sets, tee ratings, stroke index and round stat columns"
```

Expected: 60 passed (57 existing + 3 new).

---

## Task 2: Handicap — stroke allocation and hole-score caps

**Files:**
- Create: `backend/app/stats/handicap/__init__.py`, `backend/app/stats/handicap/strokes.py`
- Test: `backend/tests/test_handicap_strokes.py`

**Interfaces:**
- Consumes: nothing (pure functions, no DB).
- Produces:
  - `strokes_received(course_handicap: int, stroke_index: int) -> int`
  - `net_double_bogey(par: int, stroke_index: int, course_handicap: int) -> int`
  - `max_hole_score(par: int, stroke_index: int, course_handicap: int | None) -> int`
  - `net_par(par: int, stroke_index: int, course_handicap: int) -> int`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_handicap_strokes.py
import pytest

from app.stats.handicap.strokes import (
    max_hole_score,
    net_double_bogey,
    net_par,
    strokes_received,
)


@pytest.mark.parametrize(
    "handicap,stroke_index,expected",
    [
        (0, 1, 0),
        (0, 18, 0),
        (5, 5, 1),    # SI <= H
        (5, 6, 0),    # SI > H
        (18, 18, 1),  # exactly one stroke everywhere
        (20, 2, 2),   # SI <= H-18 gets a second stroke
        (20, 3, 1),
        (36, 18, 2),
        (54, 18, 3),
    ],
)
def test_strokes_received_positive(handicap, stroke_index, expected):
    assert strokes_received(handicap, stroke_index) == expected


@pytest.mark.parametrize(
    "handicap,stroke_index,expected",
    [
        # Appendix C: plus handicaps give strokes back BEGINNING AT STROKE INDEX 18.
        (-2, 18, -1),
        (-2, 17, -1),
        (-2, 16, 0),
        (-1, 18, -1),
        (-1, 1, 0),
    ],
)
def test_strokes_received_plus_handicap(handicap, stroke_index, expected):
    assert strokes_received(handicap, stroke_index) == expected


def test_net_double_bogey():
    # Rule 3.1b: par + 2 + strokes received.
    assert net_double_bogey(par=4, stroke_index=5, course_handicap=5) == 7
    assert net_double_bogey(par=4, stroke_index=6, course_handicap=5) == 6
    assert net_double_bogey(par=3, stroke_index=2, course_handicap=20) == 7


def test_max_hole_score_without_established_index():
    # Rule 3.1a: par + 5 before an Index exists.
    assert max_hole_score(par=4, stroke_index=1, course_handicap=None) == 9
    assert max_hole_score(par=5, stroke_index=18, course_handicap=None) == 10


def test_max_hole_score_with_established_index():
    assert max_hole_score(par=4, stroke_index=5, course_handicap=5) == 7


def test_net_par():
    # Used for holes not played (spec 2.3, documented divergence from Rule 3.2b).
    assert net_par(par=4, stroke_index=5, course_handicap=5) == 5
    assert net_par(par=4, stroke_index=6, course_handicap=5) == 4
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_handicap_strokes.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.stats.handicap'`

- [ ] **Step 3: Write the implementation**

```python
# backend/app/stats/handicap/__init__.py
"""WHS handicap calculation.

Pure functions over explicit arguments — no DB access, no ordering knowledge
outside `history`. Every constant is cited to the Rules of Handicapping
effective January 2024; see the spec's rule-verification table before
changing any of them.
"""
```

```python
# backend/app/stats/handicap/strokes.py
"""Stroke allocation and per-hole score caps (Rules 3.1, 3.2)."""


def strokes_received(course_handicap: int, stroke_index: int) -> int:
    """Handicap strokes a player receives on one hole.

    A player receives one stroke on every hole whose stroke index is <= their
    Course Handicap, and an additional stroke on holes whose stroke index is
    <= Course Handicap - 18, continuing upward.

    A plus handicap gives strokes back to the course beginning at stroke
    index 18 (Appendix C), so a +2 gives back on stroke indexes 18 and 17.
    The return value is negative in that case.
    """
    if course_handicap >= 0:
        full, remainder = divmod(course_handicap, 18)
        return full + (1 if stroke_index <= remainder else 0)

    given_back = -course_handicap
    full, remainder = divmod(given_back, 18)
    return -(full + (1 if stroke_index > 18 - remainder else 0))


def net_double_bogey(par: int, stroke_index: int, course_handicap: int) -> int:
    """Rule 3.1b: par + 2 + any handicap strokes received on that hole."""
    return par + 2 + strokes_received(course_handicap, stroke_index)


def max_hole_score(par: int, stroke_index: int, course_handicap: int | None) -> int:
    """The maximum score recordable on a hole.

    Rule 3.1a: par + 5 for a player without an established Handicap Index
    (`course_handicap is None`). Rule 3.1b: net double bogey thereafter.
    """
    if course_handicap is None:
        return par + 5
    return net_double_bogey(par, stroke_index, course_handicap)


def net_par(par: int, stroke_index: int, course_handicap: int) -> int:
    """Score assigned to a hole that was not played.

    Rule 3.2b specifies the player's expected score, whose calculation the
    USGA does not publish. Clarification 3.2b/2 permits net par instead with
    Authorized Association approval; this Index is unofficial, so the spec
    self-authorizes that substitution. See spec 2.3.
    """
    return par + strokes_received(course_handicap, stroke_index)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_handicap_strokes.py -v`
Expected: PASS (19 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/stats/handicap backend/tests/test_handicap_strokes.py
git commit -m "Add WHS stroke allocation and hole-score caps"
```

---

## Task 3: Handicap — rounding and score differentials

**Files:**
- Create: `backend/app/stats/handicap/differential.py`
- Test: `backend/tests/test_handicap_differential.py`

**Interfaces:**
- Consumes: `strokes_received`, `max_hole_score`, `net_par` from Task 2.
- Produces:
  - `round_differential(value: float) -> float` — Rule 5.1a/5.1c rounding
  - `adjusted_gross_score(holes: list[HoleScore], course_handicap: int | None) -> int`
  - `score_differential_18(ags: int, course_rating: float, slope_rating: int, pcc: float = 0.0) -> float`
  - `score_differential_9(ags: int, course_rating: float, slope_rating: int, pcc: float = 0.0) -> float`
  - `HoleScore` — a `TypedDict` with keys `par: int`, `stroke_index: int`, `strokes: int | None`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_handicap_differential.py
import pytest

from app.stats.handicap.differential import (
    adjusted_gross_score,
    round_differential,
    score_differential_9,
    score_differential_18,
)


@pytest.mark.parametrize(
    "raw,expected",
    [
        (12.34, 12.3),
        (12.35, 12.4),   # .5 rounds upwards (Rule 5.1a)
        (12.36, 12.4),
        # Rule 5.1c: minus differentials round TOWARD zero.
        (-1.54, -1.5),
        (-1.55, -1.5),
        (-1.56, -1.6),
        (0.0, 0.0),
    ],
)
def test_round_differential(raw, expected):
    assert round_differential(raw) == expected


def _holes(strokes, par=4, si_start=1):
    return [
        {"par": par, "stroke_index": si_start + i, "strokes": s}
        for i, s in enumerate(strokes)
    ]


def test_ags_caps_at_net_double_bogey():
    # Course Handicap 0, par 4, so the cap is 6 everywhere.
    holes = _holes([4, 5, 9, 6])
    assert adjusted_gross_score(holes, course_handicap=0) == 4 + 5 + 6 + 6


def test_ags_caps_at_par_plus_5_without_index():
    holes = _holes([4, 12])
    assert adjusted_gross_score(holes, course_handicap=None) == 4 + 9


def test_ags_fills_unplayed_holes_with_net_par():
    # Course Handicap 2: strokes on SI 1 and 2 only.
    holes = _holes([5, None, None])  # SI 1, 2, 3
    # 5 + net par on SI2 (4+1) + net par on SI3 (4+0)
    assert adjusted_gross_score(holes, course_handicap=2) == 5 + 5 + 4


def test_score_differential_18():
    # Rule 5.1a: (113 / 132) * (85 - 71.2 - 0) = 11.81... -> 11.8
    assert score_differential_18(85, course_rating=71.2, slope_rating=132) == 11.8


def test_score_differential_18_applies_pcc():
    assert score_differential_18(85, 71.2, 132, pcc=1.0) == 10.9


def test_score_differential_9_halves_pcc_and_stays_unrounded():
    # Rule 5.1b: (113 / 130) * (44 - 35.6 - 0.5 * 1.0)
    result = score_differential_9(44, course_rating=35.6, slope_rating=130, pcc=1.0)
    assert result == pytest.approx((113 / 130) * (44 - 35.6 - 0.5), abs=1e-9)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_handicap_differential.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.stats.handicap.differential'`

- [ ] **Step 3: Write the implementation**

```python
# backend/app/stats/handicap/differential.py
"""Adjusted gross score and Score Differentials (Rules 5.1a, 5.1b, 5.1c)."""

from decimal import ROUND_HALF_DOWN, ROUND_HALF_UP, Decimal
from typing import TypedDict

from app.stats.handicap.strokes import max_hole_score, net_par


class HoleScore(TypedDict):
    par: int
    stroke_index: int
    strokes: int | None  # None = hole not played


def round_differential(value: float) -> float:
    """Round a Score Differential to the nearest tenth.

    Rule 5.1a rounds .5 upwards. Rule 5.1c rounds minus differentials TOWARD
    zero, so -1.55 becomes -1.5, not -1.6. Together that is "round half toward
    positive infinity", which Decimal expresses as HALF_UP for non-negative
    values and HALF_DOWN for negative ones. Python's built-in round() is
    banker's rounding and is wrong for both cases.
    """
    mode = ROUND_HALF_UP if value >= 0 else ROUND_HALF_DOWN
    return float(Decimal(str(value)).quantize(Decimal("0.1"), rounding=mode))


def adjusted_gross_score(
    holes: list[HoleScore], course_handicap: int | None
) -> int:
    """Total score with each hole capped, and unplayed holes filled.

    Played holes cap at net double bogey, or par + 5 before an Index exists
    (Rule 3.1). Unplayed holes (`strokes is None`) take net par — see the
    divergence note in `strokes.net_par`. A player without an established
    Index has no Course Handicap, so unplayed holes fall back to plain par.
    """
    total = 0
    for hole in holes:
        par, stroke_index = hole["par"], hole["stroke_index"]
        strokes = hole["strokes"]
        if strokes is None:
            total += (
                par
                if course_handicap is None
                else net_par(par, stroke_index, course_handicap)
            )
        else:
            total += min(strokes, max_hole_score(par, stroke_index, course_handicap))
    return total


def score_differential_18(
    ags: int, course_rating: float, slope_rating: int, pcc: float = 0.0
) -> float:
    """Rule 5.1a, rounded to the nearest tenth."""
    return round_differential((113 / slope_rating) * (ags - course_rating - pcc))


def score_differential_9(
    ags: int, course_rating: float, slope_rating: int, pcc: float = 0.0
) -> float:
    """Rule 5.1b — note the halved PCC term.

    Returned UNROUNDED: the Rules round only after the 9-hole differential is
    combined with the player's expected score. That combination needs the
    unpublished expected-score table, so this value is displayed but never
    feeds the Index (spec 2.3).
    """
    return (113 / slope_rating) * (ags - course_rating - 0.5 * pcc)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_handicap_differential.py -v`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/stats/handicap/differential.py backend/tests/test_handicap_differential.py
git commit -m "Add adjusted gross score and WHS score differentials"
```

---

## Task 4: Handicap — Index, course handicap and caps

**Files:**
- Create: `backend/app/stats/handicap/index.py`
- Test: `backend/tests/test_handicap_index.py`

**Interfaces:**
- Consumes: `round_differential` from Task 3.
- Produces:
  - `DIFFERENTIALS_TABLE: dict[int, tuple[int, float]]` — count → (how many lowest to use, adjustment)
  - `handicap_index(differentials: list[float]) -> float | None` — uncapped; most-recent-last
  - `apply_caps(calculated: float, low_index: float | None) -> tuple[float, str | None]`
  - `course_handicap(index: float, slope_rating: int, course_rating: float, par: int) -> int`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_handicap_index.py
import pytest

from app.stats.handicap.index import (
    apply_caps,
    course_handicap,
    handicap_index,
)


def test_no_index_below_three_scores():
    assert handicap_index([]) is None
    assert handicap_index([15.0]) is None
    assert handicap_index([15.0, 16.0]) is None


def test_three_scores_uses_lowest_one_minus_two():
    # Rules of Handicapping Clarification 5.2a/1 worked example.
    assert handicap_index([15.3, 15.2, 16.6]) == 13.2


@pytest.mark.parametrize(
    "count,expected_used,expected_adjustment",
    [
        (3, 1, -2.0), (4, 1, -1.0), (5, 1, 0.0), (6, 2, -1.0),
        (7, 2, 0.0), (8, 2, 0.0), (9, 3, 0.0), (11, 3, 0.0),
        (12, 4, 0.0), (14, 4, 0.0), (15, 5, 0.0), (16, 5, 0.0),
        (17, 6, 0.0), (18, 6, 0.0), (19, 7, 0.0), (20, 8, 0.0),
    ],
)
def test_table_windows_and_adjustments(count, expected_used, expected_adjustment):
    """Feed `count` differentials where the lowest `expected_used` are all 10.0
    and the rest are 50.0, so the result isolates the window and adjustment."""
    diffs = [10.0] * expected_used + [50.0] * (count - expected_used)
    assert handicap_index(diffs) == pytest.approx(10.0 + expected_adjustment)


def test_uses_only_most_recent_twenty():
    # 25 scores: the oldest five are brilliant and must be ignored.
    diffs = [1.0] * 5 + [20.0] * 20
    assert handicap_index(diffs) == 20.0


def test_index_capped_at_54():
    assert handicap_index([90.0] * 20) == 54.0


def test_apply_caps_without_low_index_is_a_noop():
    # Caps only engage once a Low Handicap Index exists (Rules 5.7, 5.8).
    assert apply_caps(30.0, low_index=None) == (30.0, None)


def test_soft_cap_halves_increase_above_three():
    # Low 10.0, calculated 15.0 -> increase 5.0. 3.0 passes through, the
    # remaining 2.0 is halved: 10 + 3 + 1 = 14.0
    assert apply_caps(15.0, low_index=10.0) == (14.0, "soft")


def test_soft_cap_not_triggered_at_exactly_three():
    assert apply_caps(13.0, low_index=10.0) == (13.0, None)


def test_hard_cap_limits_to_five_above_low():
    # Low 10.0, calculated 30.0 -> soft cap gives 10 + 3 + 8.5 = 21.5,
    # then the hard cap clamps to 15.0.
    assert apply_caps(30.0, low_index=10.0) == (15.0, "hard")


def test_no_limit_on_decrease():
    assert apply_caps(4.0, low_index=10.0) == (4.0, None)


def test_course_handicap():
    # Rule 6.1a: 12.3 * (132/113) + (71.2 - 72) = 14.37... -> 14
    assert course_handicap(12.3, slope_rating=132, course_rating=71.2, par=72) == 14


def test_course_handicap_can_be_negative_for_plus_players():
    assert course_handicap(-2.4, slope_rating=113, course_rating=72.0, par=72) == -2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_handicap_index.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.stats.handicap.index'`

- [ ] **Step 3: Write the implementation**

```python
# backend/app/stats/handicap/index.py
"""Handicap Index calculation, caps and Course Handicap (Rules 5.2, 5.3, 5.8, 6.1a)."""

from decimal import ROUND_HALF_UP, Decimal

from app.stats.handicap.differential import round_differential

MAX_HANDICAP_INDEX = 54.0  # Rule 5.3
SOFT_CAP_THRESHOLD = 3.0   # Rule 5.8(i)
HARD_CAP_THRESHOLD = 5.0   # Rule 5.8(ii)

# Rule 5.2a: number of differentials in the record -> (lowest N used, adjustment).
DIFFERENTIALS_TABLE: dict[int, tuple[int, float]] = {
    3: (1, -2.0),
    4: (1, -1.0),
    5: (1, 0.0),
    6: (2, -1.0),
    7: (2, 0.0),
    8: (2, 0.0),
    9: (3, 0.0),
    10: (3, 0.0),
    11: (3, 0.0),
    12: (4, 0.0),
    13: (4, 0.0),
    14: (4, 0.0),
    15: (5, 0.0),
    16: (5, 0.0),
    17: (6, 0.0),
    18: (6, 0.0),
    19: (7, 0.0),
    20: (8, 0.0),
}


def handicap_index(differentials: list[float]) -> float | None:
    """Handicap Index from a scoring record, most recent LAST.

    Rules 5.2a and 5.2b. Returns None below three acceptable scores. The
    result is uncapped — `apply_caps` handles Rule 5.8 separately, because
    caps need the Low Handicap Index which only `history` can supply.
    """
    if len(differentials) < 3:
        return None

    recent = differentials[-20:]
    used, adjustment = DIFFERENTIALS_TABLE[len(recent)]
    lowest = sorted(recent)[:used]
    average = sum(lowest) / len(lowest)
    return min(round_differential(average + adjustment), MAX_HANDICAP_INDEX)


def apply_caps(
    calculated: float, low_index: float | None
) -> tuple[float, str | None]:
    """Rule 5.8. Returns (index, cap_applied) where cap_applied is
    "soft", "hard" or None.

    Caps take effect only once a Low Handicap Index has been established,
    which Rule 5.7 gates on having at least 20 acceptable scores. Callers
    pass low_index=None until then. There is no limit on decreases.
    """
    if low_index is None:
        return calculated, None

    increase = calculated - low_index
    if increase <= SOFT_CAP_THRESHOLD:
        return calculated, None

    softened = low_index + SOFT_CAP_THRESHOLD + (increase - SOFT_CAP_THRESHOLD) / 2
    if softened - low_index > HARD_CAP_THRESHOLD:
        return round_differential(low_index + HARD_CAP_THRESHOLD), "hard"
    return round_differential(softened), "soft"


def course_handicap(
    index: float, slope_rating: int, course_rating: float, par: int
) -> int:
    """Rule 6.1a, rounded to the nearest whole number.

    Uses explicit HALF_UP rather than round(), which is banker's rounding and
    would send 14.5 to 14.
    """
    raw = index * (slope_rating / 113) + (course_rating - par)
    return int(Decimal(str(raw)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_handicap_index.py -v`
Expected: PASS (28 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/stats/handicap/index.py backend/tests/test_handicap_index.py
git commit -m "Add Handicap Index, soft/hard caps and Course Handicap"
```

---

## Task 5: Handicap — the chronological walk

**Files:**
- Create: `backend/app/stats/handicap/history.py`
- Test: `backend/tests/test_handicap_history.py`

**Interfaces:**
- Consumes: everything from Tasks 2–4.
- Produces:
  - `RoundRecord` — `TypedDict` with `round_id: int`, `date: date`, `scope: str`, `course_rating: float | None`, `slope_rating: int | None`, `par: int | None`, `holes: list[HoleScore]`
  - `RoundResult` — `TypedDict` with `round_id`, `date`, `differential: float | None`, `counts_toward_index: bool`, `reason: str | None`, `index_after: float | None`
  - `walk_history(rounds: list[RoundRecord]) -> list[RoundResult]`
  - `current_state(results: list[RoundResult]) -> dict` → `{"index", "low_index", "cap_applied", "rounds_needed", "counting_round_ids"}`
  - `LOW_INDEX_MIN_SCORES = 20`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_handicap_history.py
from datetime import date, timedelta

from app.stats.handicap.history import current_state, walk_history


def _round(n, strokes_per_hole, scope="18", par=4, rating=71.2, slope=132, course_par=72):
    return {
        "round_id": n,
        "date": date(2026, 1, 1) + timedelta(days=n),
        "scope": scope,
        "course_rating": rating,
        "slope_rating": slope,
        "par": course_par,
        "holes": [
            {"par": par, "stroke_index": i + 1, "strokes": strokes_per_hole}
            for i in range(18)
        ],
    }


def test_no_index_until_three_rounds():
    results = walk_history([_round(1, 5), _round(2, 5)])
    state = current_state(results)
    assert state["index"] is None
    assert state["rounds_needed"] == 1


def test_index_appears_at_three_rounds():
    results = walk_history([_round(n, 5) for n in range(1, 4)])
    state = current_state(results)
    assert state["index"] is not None
    assert state["rounds_needed"] == 0


def test_early_rounds_cap_at_par_plus_five():
    """With no Index yet there is no Course Handicap, so a blow-up hole caps
    at par + 5 = 9 rather than net double bogey."""
    from app.stats.handicap.differential import round_differential

    r = _round(1, 5)
    r["holes"][0]["strokes"] = 20
    [result] = walk_history([r])
    # 17 holes at 5 plus one capped at 9
    expected_ags = 17 * 5 + 9
    assert result["differential"] == round_differential(
        (113 / 132) * (expected_ags - 71.2)
    )


def test_nine_hole_round_is_excluded_with_a_reason():
    nine = _round(1, 5, scope="front9", rating=35.6, slope=130, course_par=36)
    nine["holes"] = nine["holes"][:9]
    [result] = walk_history([nine])
    assert result["counts_toward_index"] is False
    assert "9-hole" in result["reason"]
    assert result["differential"] is not None  # still computed for display


def test_round_with_fewer_than_ten_holes_is_not_acceptable():
    short = _round(1, 5)
    for hole in short["holes"][8:]:
        hole["strokes"] = None
    [result] = walk_history([short])
    assert result["counts_toward_index"] is False
    assert "10 holes" in result["reason"]


def test_round_without_a_rating_is_not_acceptable():
    unrated = _round(1, 5, rating=None, slope=None)
    unrated["course_rating"] = None
    unrated["slope_rating"] = None
    [result] = walk_history([unrated])
    assert result["counts_toward_index"] is False
    assert "rating" in result["reason"]


def test_rounds_are_processed_in_date_order_regardless_of_input_order():
    rounds = [_round(3, 5), _round(1, 9), _round(2, 7)]
    results = walk_history(rounds)
    assert [r["round_id"] for r in results] == [1, 2, 3]


def test_low_index_and_caps_engage_only_after_twenty_scores():
    # Nineteen good rounds then a run of terrible ones. Before the 20th
    # score there is no Low Index, so no cap can apply.
    results = walk_history([_round(n, 4) for n in range(1, 20)])
    assert current_state(results)["low_index"] is None
    assert current_state(results)["cap_applied"] is None

    more = [_round(n, 4) for n in range(1, 21)] + [_round(n, 12) for n in range(21, 41)]
    state = current_state(walk_history(more))
    assert state["low_index"] is not None
    assert state["cap_applied"] in {"soft", "hard"}


def test_counting_round_ids_names_the_eight():
    results = walk_history([_round(n, 4 + (n % 5)) for n in range(1, 21)])
    state = current_state(results)
    assert len(state["counting_round_ids"]) == 8
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_handicap_history.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.stats.handicap.history'`

- [ ] **Step 3: Write the implementation**

```python
# backend/app/stats/handicap/history.py
"""The chronological walk over a player's scoring record.

This is the ONLY module in the handicap package that knows about ordering.
Adjusted Gross Score depends on Course Handicap, which depends on the
Handicap Index established by EARLIER rounds; caps depend on the Low Handicap
Index over the preceding 365 days. So a round cannot be evaluated in
isolation — the record is replayed in date order, carrying state forward.

Nothing here is persisted. Raw hole scores remain the single source of truth,
so correcting an old round repairs every downstream number automatically
(spec 2.5, Approach A).
"""

from datetime import date, timedelta
from typing import TypedDict

from app.stats.handicap.differential import (
    HoleScore,
    adjusted_gross_score,
    round_differential,
    score_differential_9,
    score_differential_18,
)
from app.stats.handicap.index import (
    DIFFERENTIALS_TABLE,
    apply_caps,
    course_handicap,
    handicap_index,
)

MIN_HOLES_FOR_18 = 10   # Rule 2.2a
HOLES_FOR_9 = 9         # Rule 2.2b
LOW_INDEX_MIN_SCORES = 20  # Rule 5.7
LOW_INDEX_WINDOW_DAYS = 365  # Rule 5.7


class RoundRecord(TypedDict):
    round_id: int
    date: date
    scope: str  # "18" | "front9" | "back9"
    course_rating: float | None
    slope_rating: int | None
    par: int | None
    holes: list[HoleScore]


class RoundResult(TypedDict):
    round_id: int
    date: date
    differential: float | None
    counts_toward_index: bool
    reason: str | None
    index_after: float | None


def _acceptability(record: RoundRecord, holes_played: int) -> str | None:
    """Why this round cannot count, or None if it can."""
    if record["course_rating"] is None or record["slope_rating"] is None:
        return "This tee has no rating for the scope played"
    if record["scope"] != "18":
        return "9-hole rounds do not count toward the Index (see spec 2.3)"
    if holes_played < MIN_HOLES_FOR_18:
        return f"Only {holes_played} holes scored; an 18-hole score needs at least 10 holes"
    return None


def walk_history(rounds: list[RoundRecord]) -> list[RoundResult]:
    """Replay the record in date order, returning one result per round."""
    ordered = sorted(rounds, key=lambda r: (r["date"], r["round_id"]))

    results: list[RoundResult] = []
    counting: list[float] = []  # differentials that feed the Index, oldest first
    index_history: list[tuple[date, float]] = []

    for record in ordered:
        holes_played = sum(1 for h in record["holes"] if h["strokes"] is not None)
        reason = _acceptability(record, holes_played)

        # The Index in effect BEFORE this round determines its Course Handicap.
        index_before = handicap_index(counting)
        ch = (
            None
            if index_before is None
            else course_handicap(
                index_before,
                record["slope_rating"],
                record["course_rating"],
                record["par"],
            )
        )

        differential: float | None = None
        if record["course_rating"] is not None and record["slope_rating"] is not None:
            ags = adjusted_gross_score(record["holes"], ch)
            if record["scope"] == "18":
                differential = score_differential_18(
                    ags, record["course_rating"], record["slope_rating"]
                )
            else:
                differential = round_differential(
                    score_differential_9(
                        ags, record["course_rating"], record["slope_rating"]
                    )
                )

        if reason is None and differential is not None:
            counting.append(differential)

        index_after = handicap_index(counting)
        if index_after is not None:
            index_history.append((record["date"], index_after))

        results.append(
            {
                "round_id": record["round_id"],
                "date": record["date"],
                "differential": differential,
                "counts_toward_index": reason is None,
                "reason": reason,
                "index_after": index_after,
            }
        )

    return results


def _low_index(
    index_history: list[tuple[date, float]], counting_scores: int
) -> float | None:
    """Lowest Index over the 365 days preceding the most recent score's date.

    Rule 5.7 establishes a Low Handicap Index only once the player has at
    least 20 acceptable scores, so this returns None below that.
    """
    if counting_scores < LOW_INDEX_MIN_SCORES or not index_history:
        return None
    anchor = index_history[-1][0]
    cutoff = anchor - timedelta(days=LOW_INDEX_WINDOW_DAYS)
    window = [idx for when, idx in index_history if when >= cutoff]
    return min(window) if window else None


def current_state(results: list[RoundResult]) -> dict:
    """Summarize a walked history into the player's present handicap state."""
    counting = [
        r for r in results if r["counts_toward_index"] and r["differential"] is not None
    ]
    differentials = [r["differential"] for r in counting]
    calculated = handicap_index(differentials)

    index_history = [
        (r["date"], r["index_after"]) for r in results if r["index_after"] is not None
    ]
    low = _low_index(index_history, len(counting))

    index, cap_applied = (
        (None, None) if calculated is None else apply_caps(calculated, low)
    )

    recent = counting[-20:]
    counting_ids: list[int] = []
    if len(recent) >= 3:
        take, _ = DIFFERENTIALS_TABLE[len(recent)]
        counting_ids = [
            r["round_id"]
            for r in sorted(recent, key=lambda r: r["differential"])[:take]
        ]

    return {
        "index": index,
        "low_index": low,
        "cap_applied": cap_applied,
        "rounds_needed": max(0, 3 - len(counting)),
        "counting_round_ids": counting_ids,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_handicap_history.py -v`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/stats/handicap/history.py backend/tests/test_handicap_history.py
git commit -m "Add chronological handicap history walk"
```

---

## Task 6: Round statistics engine

**Files:**
- Create: `backend/app/stats/round_stats.py`
- Test: `backend/tests/test_round_stats.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `compute_round_stats(holes: list[dict]) -> dict` where each hole dict has `par`, `strokes`, `putts`, `fairway_hit`, `penalties`. Returns keys `score`, `to_par`, `fairways_hit`, `fairways_possible`, `fairway_pct`, `gir`, `gir_pct`, `putts`, `putts_per_gir`, `one_putts`, `three_putts`, `scrambling_pct`, `penalties`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_round_stats.py
from app.stats.round_stats import compute_round_stats


def _hole(par=4, strokes=4, putts=2, fairway_hit=True, penalties=0):
    return {
        "par": par, "strokes": strokes, "putts": putts,
        "fairway_hit": fairway_hit, "penalties": penalties,
    }


def test_empty_round():
    s = compute_round_stats([])
    assert s["score"] == 0
    assert s["gir_pct"] is None
    assert s["fairway_pct"] is None
    assert s["putts_per_gir"] is None


def test_score_and_to_par():
    holes = [_hole(par=4, strokes=5), _hole(par=3, strokes=3)]
    s = compute_round_stats(holes)
    assert s["score"] == 8
    assert s["to_par"] == 1


def test_gir_derived_from_strokes_minus_putts():
    # par 4, 4 strokes, 2 putts -> 2 shots to the green -> GIR (<= par - 2)
    hit = _hole(par=4, strokes=4, putts=2)
    # par 4, 5 strokes, 2 putts -> 3 shots to the green -> not GIR
    miss = _hole(par=4, strokes=5, putts=2)
    s = compute_round_stats([hit, miss])
    assert s["gir"] == 1
    assert s["gir_pct"] == 50.0


def test_par_threes_excluded_from_fairway_denominator():
    holes = [
        _hole(par=3, fairway_hit=None),
        _hole(par=4, fairway_hit=True),
        _hole(par=5, fairway_hit=False),
    ]
    s = compute_round_stats(holes)
    assert s["fairways_possible"] == 2
    assert s["fairways_hit"] == 1
    assert s["fairway_pct"] == 50.0


def test_missing_data_excluded_from_denominator_not_counted_as_zero():
    """A partially filled scorecard must not report 0% fairways."""
    holes = [_hole(par=4, fairway_hit=True), _hole(par=4, fairway_hit=None)]
    s = compute_round_stats(holes)
    assert s["fairways_possible"] == 1
    assert s["fairway_pct"] == 100.0


def test_putts_per_gir_uses_only_gir_holes():
    gir = _hole(par=4, strokes=4, putts=2)
    non_gir = _hole(par=4, strokes=6, putts=3)
    s = compute_round_stats([gir, non_gir])
    assert s["putts"] == 5
    assert s["putts_per_gir"] == 2.0


def test_one_and_three_putt_counts():
    holes = [_hole(putts=1), _hole(putts=3), _hole(putts=2), _hole(putts=4)]
    s = compute_round_stats(holes)
    assert s["one_putts"] == 1
    assert s["three_putts"] == 2  # 3 or more


def test_scrambling_counts_missed_gir_saved_for_par_or_better():
    # Missed GIR (3 shots to green) but holed in 4 -> par -> scramble saved.
    saved = _hole(par=4, strokes=4, putts=1)
    # Missed GIR and made bogey -> not saved.
    lost = _hole(par=4, strokes=5, putts=2)
    s = compute_round_stats([saved, lost])
    assert s["scrambling_pct"] == 50.0


def test_penalties_total():
    s = compute_round_stats([_hole(penalties=1), _hole(penalties=2)])
    assert s["penalties"] == 3
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_round_stats.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.stats.round_stats'`

- [ ] **Step 3: Write the implementation**

```python
# backend/app/stats/round_stats.py
"""Derived per-round statistics.

Everything here is computed on demand from hole rows — nothing is stored,
per the repo's derived-stats convention. Holes missing the data a stat needs
are excluded from that stat's DENOMINATOR rather than counted as zero, so a
half-filled scorecard never reports 0% fairways.
"""


def _pct(hit: int, possible: int) -> float | None:
    return round(100 * hit / possible, 1) if possible else None


def compute_round_stats(holes: list[dict]) -> dict:
    scored = [h for h in holes if h.get("strokes") is not None]

    score = sum(h["strokes"] for h in scored)
    par_total = sum(h["par"] for h in scored)

    # Fairways: par 3s are excluded from the denominator entirely.
    fairway_holes = [
        h for h in holes if h["par"] >= 4 and h.get("fairway_hit") is not None
    ]
    fairways_hit = sum(1 for h in fairway_holes if h["fairway_hit"])

    # GIR needs both strokes and putts: strokes - putts is the number of shots
    # taken to reach the green, and regulation is par - 2.
    gir_eligible = [h for h in scored if h.get("putts") is not None]
    gir_holes = [h for h in gir_eligible if h["strokes"] - h["putts"] <= h["par"] - 2]

    putt_holes = [h for h in holes if h.get("putts") is not None]
    putts_total = sum(h["putts"] for h in putt_holes)
    gir_putts = sum(h["putts"] for h in gir_holes)

    # Scrambling: of holes that missed GIR, the share still made in par or better.
    missed_gir = [h for h in gir_eligible if h not in gir_holes]
    scrambles = sum(1 for h in missed_gir if h["strokes"] <= h["par"])

    return {
        "score": score,
        "to_par": score - par_total,
        "fairways_hit": fairways_hit,
        "fairways_possible": len(fairway_holes),
        "fairway_pct": _pct(fairways_hit, len(fairway_holes)),
        "gir": len(gir_holes),
        "gir_pct": _pct(len(gir_holes), len(gir_eligible)),
        "putts": putts_total,
        "putts_per_gir": (
            round(gir_putts / len(gir_holes), 2) if gir_holes else None
        ),
        "one_putts": sum(1 for h in putt_holes if h["putts"] == 1),
        "three_putts": sum(1 for h in putt_holes if h["putts"] >= 3),
        "scrambling_pct": _pct(scrambles, len(missed_gir)),
        "penalties": sum(h.get("penalties") or 0 for h in holes),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_round_stats.py -v`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/stats/round_stats.py backend/tests/test_round_stats.py
git commit -m "Add derived round statistics engine"
```

---

## Task 7: Tees, ratings and stroke-index API

**Files:**
- Create: `backend/app/schemas/tee.py`, `backend/app/routers/tees.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_tees.py` (append)

**Interfaces:**
- Consumes: `TeeSet`, `TeeRating` from Task 1.
- Produces: `GET|POST /courses/{course_id}/tees`, `PATCH|DELETE /tees/{tee_id}`, `PUT /tees/{tee_id}/ratings/{scope}`, `PUT /courses/{course_id}/stroke-index`.

- [ ] **Step 1: Write the failing test**

```python
# append to backend/tests/test_tees.py
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
```

Add this fixture to `backend/tests/conftest.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_tees.py -v`
Expected: FAIL — 404 on `/api/courses/{id}/tees`, the router does not exist.

- [ ] **Step 3: Write the schemas and router**

```python
# backend/app/schemas/tee.py
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Scope = Literal["18", "front9", "back9"]


class TeeRatingIn(BaseModel):
    course_rating: float
    slope_rating: int = Field(ge=55, le=155)
    par: int = Field(ge=27, le=100)


class TeeRatingOut(TeeRatingIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    scope: Scope


class TeeSetIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    yardage: int | None = Field(default=None, ge=0)


class TeeSetPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    yardage: int | None = Field(default=None, ge=0)


class TeeSetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    course_id: int
    name: str
    yardage: int | None
    ratings: list[TeeRatingOut] = []


class StrokeIndexIn(BaseModel):
    stroke_indexes: list[int] = Field(min_length=1)
```

```python
# backend/app/routers/tees.py
"""Tee sets, their per-scope ratings, and course stroke indexes.

Course Rating, Slope Rating and stroke index are not in OpenStreetMap and
have no open API (spec 3.1), so they are entered here by hand. Validation is
strict on purpose: catching a transposed stroke index at entry is far cheaper
than discovering it inside a differential months later.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Course, Hole, TeeRating, TeeSet, User
from app.schemas.tee import (
    Scope,
    StrokeIndexIn,
    TeeRatingIn,
    TeeRatingOut,
    TeeSetIn,
    TeeSetOut,
    TeeSetPatch,
)

router = APIRouter(tags=["tees"])


def _course_or_404(db: Session, course_id: int) -> Course:
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    return course


def _tee_or_404(db: Session, tee_id: int) -> TeeSet:
    tee = db.get(TeeSet, tee_id)
    if tee is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tee set not found")
    return tee


@router.get("/courses/{course_id}/tees", response_model=list[TeeSetOut])
def list_tees(
    course_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TeeSet]:
    _course_or_404(db, course_id)
    return list(db.query(TeeSet).filter(TeeSet.course_id == course_id).all())


@router.post(
    "/courses/{course_id}/tees",
    response_model=TeeSetOut,
    status_code=status.HTTP_201_CREATED,
)
def create_tee(
    course_id: int,
    payload: TeeSetIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TeeSet:
    _course_or_404(db, course_id)
    tee = TeeSet(course_id=course_id, name=payload.name.strip(), yardage=payload.yardage)
    db.add(tee)
    db.commit()
    db.refresh(tee)
    return tee


@router.patch("/tees/{tee_id}", response_model=TeeSetOut)
def update_tee(
    tee_id: int,
    payload: TeeSetPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TeeSet:
    tee = _tee_or_404(db, tee_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(tee, field, value.strip() if isinstance(value, str) else value)
    db.commit()
    db.refresh(tee)
    return tee


@router.delete("/tees/{tee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tee(
    tee_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    db.delete(_tee_or_404(db, tee_id))
    db.commit()


@router.put("/tees/{tee_id}/ratings/{scope}", response_model=TeeRatingOut)
def upsert_rating(
    tee_id: int,
    scope: Scope,
    payload: TeeRatingIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TeeRating:
    _tee_or_404(db, tee_id)
    rating = (
        db.query(TeeRating)
        .filter(TeeRating.tee_set_id == tee_id, TeeRating.scope == scope)
        .one_or_none()
    )
    if rating is None:
        rating = TeeRating(tee_set_id=tee_id, scope=scope)
        db.add(rating)
    rating.course_rating = payload.course_rating
    rating.slope_rating = payload.slope_rating
    rating.par = payload.par
    db.commit()
    db.refresh(rating)
    return rating


@router.put("/courses/{course_id}/stroke-index", response_model=list[int])
def set_stroke_indexes(
    course_id: int,
    payload: StrokeIndexIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[int]:
    _course_or_404(db, course_id)
    holes = (
        db.query(Hole).filter(Hole.course_id == course_id).order_by(Hole.number).all()
    )
    values = payload.stroke_indexes
    if len(values) != len(holes):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"Expected {len(holes)} stroke indexes, got {len(values)}",
        )
    if sorted(values) != list(range(1, len(holes) + 1)):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"Stroke indexes must be a permutation of 1..{len(holes)}",
        )
    for hole, value in zip(holes, values):
        hole.stroke_index = value
    db.commit()
    return values
```

In `app/main.py`, import and include the router next to the existing ones:

```python
from app.routers import tees
api.include_router(tees.router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_tees.py -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/tee.py backend/app/routers/tees.py backend/app/main.py backend/tests
git commit -m "Add tee, rating and stroke-index endpoints"
```

---

## Task 8: Rounds — tee selection, rating snapshot, backlog creation

**Files:**
- Modify: `backend/app/schemas/round.py`, `backend/app/routers/rounds.py:51-78` (`create_round`), `backend/app/routers/rounds.py:115-135` (`update_round_hole`)
- Test: `backend/tests/test_rounds.py` (append)

**Interfaces:**
- Consumes: `TeeSet`, `TeeRating` (Task 1); `Scope` (Task 7).
- Produces: `POST /rounds` accepting `tee_set_id`, `hole_count`, `nine`, `status`, and inline `holes`; `PATCH /rounds/{id}/holes/{number}` accepting `fairway_hit`, `putts`, `penalties`.

- [ ] **Step 1: Write the failing test**

```python
# append to backend/tests/test_rounds.py
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
```

Add this fixture to `backend/tests/conftest.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_rounds.py -v`
Expected: FAIL — the response has no `course_rating` key.

- [ ] **Step 3: Extend the schemas and the router**

In `app/schemas/round.py`, first widen the existing status alias — the repo
already uses `completed` (not `complete`), so keep that spelling and only add
the new value:

```python
RoundStatus = Literal["in_progress", "completed", "abandoned"]
```

Then add the request/response fields. Keep the existing classes and add to them:

```python
from typing import Literal

from pydantic import Field, model_validator


class RoundHoleIn(BaseModel):
    number: int = Field(ge=1, le=18)
    strokes: int | None = Field(default=None, ge=1)
    putts: int | None = Field(default=None, ge=0)
    fairway_hit: bool | None = None
    penalties: int = Field(default=0, ge=0)


class RoundHolePatch(BaseModel):
    strokes: int | None = Field(default=None, ge=1)
    putts: int | None = Field(default=None, ge=0)
    fairway_hit: bool | None = None
    penalties: int | None = Field(default=None, ge=0)
```

Add to the existing `RoundCreate`:

```python
    tee_set_id: int | None = None
    hole_count: Literal[9, 18] = 18
    nine: Literal["front", "back"] | None = None
    status: RoundStatus = "in_progress"
    holes: list[RoundHoleIn] | None = None

    @model_validator(mode="after")
    def check_nine(self):
        if self.hole_count == 9 and self.nine is None:
            raise ValueError("A 9-hole round must specify which nine ('front' or 'back')")
        if self.hole_count == 18 and self.nine is not None:
            raise ValueError("'nine' only applies to 9-hole rounds")
        return self
```

Add to the existing `RoundOut`: `tee_set_id: int | None`, `hole_count: int`, `nine: str | None`, `course_rating: float | None`, `slope_rating: int | None`, `course_par: int | None`. Add to the existing round-hole output model: `putts: int | None`, `fairway_hit: bool | None`, `penalties: int`.

In `app/routers/rounds.py`, add a scope helper and use it in `create_round`:

```python
def _scope_for(hole_count: int, nine: str | None) -> str:
    """The TeeRating scope a round is played against.

    Declared at creation and fixed — an 18-hole round abandoned at hole 12 is
    still an 18-hole round against the 18-hole rating (spec 3.2).
    """
    return "18" if hole_count == 18 else f"{nine}9"


def _snapshot_rating(db: Session, tee_set_id: int | None, scope: str):
    """Copy rating/slope/par off the tee at creation so a later re-rating
    cannot rewrite this round's differential (spec 3.2)."""
    if tee_set_id is None:
        return None, None, None
    tee = db.get(TeeSet, tee_set_id)
    if tee is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tee set not found")
    rating = (
        db.query(TeeRating)
        .filter(TeeRating.tee_set_id == tee_set_id, TeeRating.scope == scope)
        .one_or_none()
    )
    if rating is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"This tee has no {scope} rating; add one before starting the round",
        )
    return rating.course_rating, rating.slope_rating, rating.par
```

In `create_round`, after validating the course and before commit:

```python
    scope = _scope_for(payload.hole_count, payload.nine)
    course_rating, slope_rating, course_par = _snapshot_rating(
        db, payload.tee_set_id, scope
    )
    r = Round(
        user_id=user.id,
        course_id=payload.course_id,
        date=payload.date,
        status=payload.status,
        tee_set_id=payload.tee_set_id,
        hole_count=payload.hole_count,
        nine=payload.nine,
        course_rating=course_rating,
        slope_rating=slope_rating,
        course_par=course_par,
    )
```

Keep the existing per-hole `RoundHole` seeding. Then apply any inline backlog scores after the holes exist:

```python
    if payload.holes:
        by_number = {rh.hole.number: rh for rh in r.holes}
        for incoming in payload.holes:
            rh = by_number.get(incoming.number)
            if rh is None:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                    f"Course has no hole {incoming.number}",
                )
            rh.strokes = incoming.strokes
            rh.putts = incoming.putts
            rh.fairway_hit = incoming.fairway_hit
            rh.penalties = incoming.penalties
```

In `update_round_hole`, swap the body to accept `RoundHolePatch` and apply only the fields that were set:

```python
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rh, field, value)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_rounds.py -v`
Expected: PASS — all existing round tests plus 8 new ones.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/round.py backend/app/routers/rounds.py backend/tests
git commit -m "Add tee selection, rating snapshot and backlog rounds"
```

---

## Task 9: Round stats and handicap endpoints

**Files:**
- Modify: `backend/app/schemas/stats.py`, `backend/app/routers/rounds.py`, `backend/app/routers/stats.py`
- Test: `backend/tests/test_stats_handicap_api.py`

**Interfaces:**
- Consumes: `compute_round_stats` (Task 6); `walk_history`, `current_state` (Task 5).
- Produces: `GET /rounds/{id}/stats`, `GET /stats/handicap`, `GET /stats/rounds?limit=N`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_stats_handicap_api.py
def _post_round(client, auth_headers, course_id, tee_id, date, strokes):
    return client.post(
        "/api/rounds",
        json={
            "course_id": course_id, "date": date, "tee_set_id": tee_id,
            "status": "completed",
            "holes": [
                {"number": n, "strokes": strokes, "putts": 2, "fairway_hit": True}
                for n in range(1, 19)
            ],
        },
        headers=auth_headers,
    )


def test_round_stats_endpoint(client, auth_headers, rated_course):
    course_id, tee_id = rated_course
    round_id = _post_round(
        client, auth_headers, course_id, tee_id, "2026-09-01", 5
    ).json()["id"]

    resp = client.get(f"/api/rounds/{round_id}/stats", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["score"] == 90
    assert body["to_par"] == 18
    assert body["gir"] == 0          # 5 strokes - 2 putts = 3 > par - 2
    assert body["putts"] == 36
    assert body["differential"] is not None
    assert body["counts_toward_index"] is True


def test_handicap_null_until_three_rounds(client, auth_headers, rated_course):
    course_id, tee_id = rated_course
    _post_round(client, auth_headers, course_id, tee_id, "2026-09-01", 5)

    resp = client.get("/api/stats/handicap", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["index"] is None
    assert body["rounds_needed"] == 2


def test_handicap_appears_at_three_rounds(client, auth_headers, rated_course):
    course_id, tee_id = rated_course
    for i, strokes in enumerate([5, 6, 5], start=1):
        _post_round(client, auth_headers, course_id, tee_id, f"2026-09-0{i}", strokes)

    body = client.get("/api/stats/handicap", headers=auth_headers).json()
    assert body["index"] is not None
    assert body["rounds_needed"] == 0
    assert len(body["differentials"]) == 3
    assert body["low_index"] is None      # needs 20 scores
    assert body["cap_applied"] is None


def test_handicap_reports_non_counting_rounds_with_a_reason(
    client, auth_headers, rated_course
):
    course_id, tee_id = rated_course
    client.post(
        "/api/rounds",
        json={
            "course_id": course_id, "date": "2026-09-05", "tee_set_id": tee_id,
            "hole_count": 9, "nine": "front", "status": "completed",
            "holes": [{"number": n, "strokes": 5} for n in range(1, 10)],
        },
        headers=auth_headers,
    )
    body = client.get("/api/stats/handicap", headers=auth_headers).json()
    excluded = [d for d in body["differentials"] if not d["counts_toward_index"]]
    assert excluded and "9-hole" in excluded[0]["reason"]


def test_handicap_is_per_user(client, auth_headers, rated_course):
    """A second user sees an empty record even though the first has rounds."""
    course_id, tee_id = rated_course
    for i in range(1, 4):
        _post_round(client, auth_headers, course_id, tee_id, f"2026-09-0{i}", 5)

    client.post(
        "/api/admin/users",
        json={"email": "friend@example.com", "password": "pw12345678",
              "display_name": "Friend"},
        headers=auth_headers,
    )
    token = client.post(
        "/api/auth/login",
        data={"username": "friend@example.com", "password": "pw12345678"},
    ).json()["access_token"]
    other = {"Authorization": f"Bearer {token}"}

    body = client.get("/api/stats/handicap", headers=other).json()
    assert body["index"] is None
    assert body["differentials"] == []


def test_stats_rounds_trend(client, auth_headers, rated_course):
    course_id, tee_id = rated_course
    for i, strokes in enumerate([5, 6, 4], start=1):
        _post_round(client, auth_headers, course_id, tee_id, f"2026-09-0{i}", strokes)

    body = client.get("/api/stats/rounds?limit=2", headers=auth_headers).json()
    assert len(body["rounds"]) == 2
    assert body["averages"]["putts"] == 36.0


def test_stats_endpoints_require_auth(client):
    assert client.get("/api/stats/handicap").status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_stats_handicap_api.py -v`
Expected: FAIL — 404 on `/api/stats/handicap`.

- [ ] **Step 3: Write the schemas, the record builder and the endpoints**

Add to `app/schemas/stats.py`:

```python
class RoundStats(BaseModel):
    score: int
    to_par: int
    fairways_hit: int
    fairways_possible: int
    fairway_pct: float | None
    gir: int
    gir_pct: float | None
    putts: int
    putts_per_gir: float | None
    one_putts: int
    three_putts: int
    scrambling_pct: float | None
    penalties: int
    differential: float | None
    counts_toward_index: bool
    reason: str | None


class DifferentialRow(BaseModel):
    round_id: int
    date: date
    differential: float | None
    counts_toward_index: bool
    reason: str | None
    is_counting: bool  # one of the lowest 8 currently feeding the Index


class HandicapOut(BaseModel):
    index: float | None
    low_index: float | None
    cap_applied: str | None
    rounds_needed: int
    differentials: list[DifferentialRow]


class RoundTrendOut(BaseModel):
    rounds: list[RoundStats]
    averages: dict[str, float | None]
```

Add a shared record builder in `app/routers/stats.py` — both endpoints need it:

```python
def _round_records(db: Session, user: User) -> list[dict]:
    """Load the user's rounds as RoundRecords for the handicap walk.

    Scope comes from the round's declared hole_count/nine, and rating values
    from the round's own snapshot — never live from the tee (spec 3.2).
    """
    rounds = (
        db.query(Round)
        .filter(Round.user_id == user.id, Round.status == "completed")
        .all()
    )
    records = []
    for r in rounds:
        holes = []
        for rh in r.holes:
            holes.append(
                {
                    "par": rh.par,
                    "stroke_index": rh.hole.stroke_index or rh.hole.number,
                    "strokes": rh.strokes,
                }
            )
        records.append(
            {
                "round_id": r.id,
                "date": r.date,
                "scope": "18" if r.hole_count == 18 else f"{r.nine}9",
                "course_rating": r.course_rating,
                "slope_rating": r.slope_rating,
                "par": r.course_par,
                "holes": holes,
            }
        )
    return records


@router.get("/stats/handicap", response_model=HandicapOut)
def get_handicap(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HandicapOut:
    results = walk_history(_round_records(db, user))
    state = current_state(results)
    counting_ids = set(state["counting_round_ids"])
    return HandicapOut(
        index=state["index"],
        low_index=state["low_index"],
        cap_applied=state["cap_applied"],
        rounds_needed=state["rounds_needed"],
        differentials=[
            DifferentialRow(
                round_id=r["round_id"],
                date=r["date"],
                differential=r["differential"],
                counts_toward_index=r["counts_toward_index"],
                reason=r["reason"],
                is_counting=r["round_id"] in counting_ids,
            )
            for r in results
        ],
    )


@router.get("/stats/rounds", response_model=RoundTrendOut)
def get_round_trend(
    limit: int = 20,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RoundTrendOut:
    results = {r["round_id"]: r for r in walk_history(_round_records(db, user))}
    rounds = (
        db.query(Round)
        .filter(Round.user_id == user.id, Round.status == "completed")
        .order_by(Round.date.desc())
        .limit(limit)
        .all()
    )
    stats = [_round_stats_for(r, results.get(r.id)) for r in rounds]

    def _mean(key: str) -> float | None:
        values = [getattr(s, key) for s in stats if getattr(s, key) is not None]
        return round(sum(values) / len(values), 1) if values else None

    return RoundTrendOut(
        rounds=stats,
        averages={k: _mean(k) for k in ("score", "putts", "gir_pct", "fairway_pct")},
    )
```

Put the shared per-round assembler somewhere both routers import — `app/stats/round_stats.py` is the natural home for the mapping, but the DB-to-dict step belongs in the router layer. Add to `app/routers/stats.py`:

```python
def _round_stats_for(r: Round, result: dict | None) -> RoundStats:
    holes = [
        {
            "par": rh.par,
            "strokes": rh.strokes,
            "putts": rh.putts,
            "fairway_hit": rh.fairway_hit,
            "penalties": rh.penalties,
        }
        for rh in r.holes
    ]
    return RoundStats(
        **compute_round_stats(holes),
        differential=(result or {}).get("differential"),
        counts_toward_index=(result or {}).get("counts_toward_index", False),
        reason=(result or {}).get("reason"),
    )
```

In `app/routers/rounds.py`, add the per-round endpoint, importing `_round_stats_for` and `_round_records` from `app.routers.stats`:

```python
@router.get("/{round_id}/stats", response_model=RoundStats)
def get_round_stats(
    round_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RoundStats:
    r = _owned_round(db, round_id, user)
    results = {x["round_id"]: x for x in walk_history(_round_records(db, user))}
    return _round_stats_for(r, results.get(r.id))
```

If that import direction creates a cycle, move `_round_records` and `_round_stats_for` into a new `app/stats/records.py` and import from there in both routers.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_stats_handicap_api.py -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Run the full suite and commit**

```bash
cd backend && .venv/bin/pytest -q
git add backend/app backend/tests
git commit -m "Add round stats and handicap endpoints"
```

Expected: all green.

---

## Task 10: Verify end to end, update docs, mark the plan done

**Files:**
- Modify: `CLAUDE.md`, `docs/superpowers/README.md`, `docs/superpowers/specs/2026-09-03-scores-stats-handicap-design.md`, this plan

- [ ] **Step 1: Verify the migration chain from scratch**

```bash
cd backend
rm -f /tmp/verify.db
DATABASE_URL=sqlite:////tmp/verify.db .venv/bin/alembic upgrade head
DATABASE_URL=sqlite:////tmp/verify.db .venv/bin/alembic downgrade base
DATABASE_URL=sqlite:////tmp/verify.db .venv/bin/alembic upgrade head
```

Expected: all succeed.

- [ ] **Step 2: Verify the container still builds and serves**

```bash
docker compose up --build -d
curl -fsS http://localhost:8000/api/health
curl -fsS http://localhost:8000/api/docs -o /dev/null && echo "docs ok"
docker compose down
```

Expected: health returns OK and the docs page loads.

- [ ] **Step 3: Run the full suite and record the count**

```bash
cd backend && .venv/bin/pytest -q
```

Expected: all green. Note the exact number for the status banner.

- [ ] **Step 4: Update the docs**

In `CLAUDE.md`: mark Pillar 3 backend built in the build-order list; add `TeeSet`/`TeeRating` to the models line, `tees` to the routers line, and `stats/handicap/`, `stats/round_stats.py` to the layout; add the new endpoints to the API surface; update the Status section with the new test count. Add a convention entry: *the handicap engine recomputes from raw hole scores on every request; never add a cached Index column.*

In `docs/superpowers/README.md`: move Pillar 3 to show the backend complete and the frontend (Plan 3b) as the next slice.

In the spec: append a decision-log entry noting Plan 3a is complete and any divergence discovered during the build.

- [ ] **Step 5: Add the status banner to this plan**

Add at the top of this file, under the title:

```markdown
> **✅ STATUS: COMPLETE (verified YYYY-MM-DD).** All 10 tasks done. Backend
> suite green (<N> tests). Alembic chain applies to a fresh DB and on top of
> the existing revisions. Docker image builds and serves `/api/health` and
> `/api/docs`.
```

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs backend
git commit -m "Verify Pillar 3 backend, update docs, mark Plan 3a complete"
```

---

## Notes for the implementer

**Do not "fix" a WHS constant.** Every number in `app/stats/handicap/` is cited to a rule in spec §7, which was verified against the 2024 *Rules of Handicapping*. Several are counterintuitive on purpose:

- Minus differentials round *toward* zero (−1.55 → −1.5), unlike positive ones. Rule 5.1c.
- Plus handicaps give strokes back starting at stroke index **18**, not 1. Appendix C.
- An 18-hole score needs **10** holes, not 14. Rule 2.2a.
- Caps do nothing until 20 acceptable scores exist. Rules 5.7, 5.8.

**Python's `round()` is banker's rounding** and is wrong everywhere in this package. Use the `Decimal` helpers.

**9-hole rounds deliberately do not feed the Index.** The conversion needs the USGA's unpublished expected-score table (spec §2.3). If a test seems to want them counted, the test is wrong.
