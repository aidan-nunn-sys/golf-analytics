# Golf Analytics

Self-hosted, open-source golf analytics for the owner + friends/family. Small multi-user, web-only, Docker-deployed. A learning project: favor clear, well-documented, not-over-engineered code.

## Read these first

- **Design / architecture (source of truth):** `docs/superpowers/specs/2026-06-19-golf-analytics-design.md` — vision, the four pillars, stack decisions, data model, and a dated decision log. Append decisions there as they're made.
- **Backend implementation plan:** `docs/superpowers/plans/2026-06-19-backend-club-shot-engine.md` — task-by-task. Tasks 1–10 are built; Task 11 (packaging) is not.

## Documentation discipline (standing directive)

Document the journey to a working application as we go — the repo should always tell the story of how we got here. This is required, not optional:

- **Every slice follows spec → plan → build.** A feature starts as a dated design spec in `docs/superpowers/specs/`, becomes a dated plan in `docs/superpowers/plans/`, then gets built. No building ahead of an approved spec.
- **Keep decision logs current.** When a real decision is made (stack, scope, a trade-off, a deferral), append a dated entry to the relevant spec's decision log. Convert relative dates to absolute.
- **Mark plans done when done.** When a plan is fully implemented and verified, add a ✅ STATUS banner at its top summarizing what was verified (files, tests, what runs).
- **Docs reflect reality.** If code diverges from a spec, update the spec (or log the divergence) — don't leave docs stale.

See `docs/superpowers/README.md` for the full convention.

## Build order (pillars, one slice at a time)

1. **Club & shot analysis** (range engine) — *v1, the foundation.* Built.
2. On-course GPS + OpenStreetMap course management — later.
3. Score / stats / handicap logging — later.
4. Learning profile + recommendations (north star: strokes gained) — later.

Each later pillar gets its own spec → plan → build cycle. Don't pull future-pillar work into the current slice.

## Stack

| Layer | Choice |
|---|---|
| API | FastAPI (Python 3.12), Pydantic v2 |
| DB | SQLite via SQLAlchemy 2.0 (typed `Mapped`/`mapped_column`); Postgres-ready (config-only swap) |
| Stats | pandas, pure functions in `app/stats/` |
| Auth | JWT bearer; passlib[bcrypt]; admin-created accounts only |
| Tests | pytest + httpx TestClient |
| Frontend | React + Vite + TypeScript (not built yet) |
| Packaging | Docker Compose |

## Layout

```
backend/app/
  main.py            FastAPI app, lifespan creates tables + bootstraps admin
  config.py          Settings (env-driven): secret_key, admin_*, database_url
  database.py        Base, engine, SessionLocal, get_db()
  security.py        hash/verify password, create/decode JWT
  deps.py            get_current_user / get_current_admin
  seed.py            create_user (also seeds standard bag), bootstrap_admin
  standard_bag.py    default clubs seeded per new user
  models/            User, Club, RangeSession, Shot
  schemas/           Pydantic in/out per resource
  routers/           auth, admin, clubs, sessions, shots, stats
  stats/engine.py    compute_club_stats, compute_gapping (derived, never stored)
backend/tests/       one test_*.py per router/module
```

## Commands

Run from `backend/`. The venv lives at `backend/.venv`.

```bash
cd backend
.venv/bin/pytest -q                          # full suite
.venv/bin/pytest tests/test_stats_engine.py  # one file
.venv/bin/uvicorn app.main:app --reload      # dev server -> http://localhost:8000/docs
```

Interactive API docs at `/docs`. First run creates the admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Conventions (don't break these)

- **Distances are canonically yards** (float) everywhere in the DB and API. `unit_preference` (yards/meters) is display-only — convert in the frontend, never store meters.
- **Stats are derived, never stored.** Computed on demand from shots. Don't add aggregate columns or a cache unless data actually gets large (YAGNI).
- **Per-user isolation.** Every list/get query filters by the calling user. Ownership of a shot is checked via its parent session. New endpoints must scope to `current_user`.
- **No open self-signup.** Accounts are admin-created (`POST /admin/users`); bootstrap admin seeded at first run from env.
- **Enums are string-validated:** `direction ∈ {left, straight, right}`, `source ∈ {manual, launch_monitor, gps}` (only `manual` wired in v1), `category ∈ {wood, hybrid, iron, wedge, putter}`. Putter is excluded from yardage analysis.
- **Reserved-but-not-wired fields exist on purpose** (`total_yards`, `accuracy`, `source != manual`). Leave the seams; don't build UI/flows for them until their pillar.
- **Schema:** v1 uses `Base.metadata.create_all()`. Alembic is deferred until the schema must evolve — all v1 fields (incl. reserved) are defined upfront.
- **TDD for the stats engine.** It's pure functions over known inputs — write the failing test first (see `test_stats_engine.py`).

## API surface (v1)

`POST /auth/login` · `GET|PATCH /auth/me` · `POST /admin/users` (admin) · `GET|POST /clubs` `PATCH|DELETE /clubs/{id}` · `GET|POST /sessions` `GET|PATCH|DELETE /sessions/{id}` · `POST|GET /sessions/{id}/shots` `PATCH|DELETE /shots/{id}` · `GET /clubs/{id}/stats` · `GET /stats/gapping` · `GET /stats/dashboard`

## Status

Backend v1 complete through stats/dashboard endpoints (32 tests green). **Not done:** Docker packaging + README + LICENSE (Task 11), and the React frontend (Plan 2, not yet written).
