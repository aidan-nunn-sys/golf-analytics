# Golf Analytics

Self-hosted, open-source golf analytics for the owner + friends/family. Small multi-user, web-only, Docker-deployed. A learning project: favor clear, well-documented, not-over-engineered code.

## Read these first

- **Design / architecture (source of truth):** `docs/superpowers/specs/2026-06-19-golf-analytics-design.md` — vision, the four pillars, stack decisions, data model, and a dated decision log. Append decisions there as they're made.
- **Workflow convention:** `docs/superpowers/README.md` — the spec → plan → build cycle.
- **Per-slice specs & plans** (all four below are ✅ complete):

  | Slice | Spec | Plan |
  |---|---|---|
  | Pillar 1 backend | `specs/2026-06-19-golf-analytics-design.md` | `plans/2026-06-19-backend-club-shot-engine.md` |
  | Pillar 1 frontend | `specs/2026-06-30-frontend-club-shot-analysis-design.md` | `plans/2026-06-30-frontend-club-shot-analysis.md` |
  | Pillar 2 backend | `specs/2026-07-11-on-course-gps-course-management-design.md` | `plans/2026-07-11-backend-on-course-gps-course-management.md` |
  | Pillar 2 frontend | `specs/2026-07-19-frontend-on-course-gps-design.md` | `plans/2026-07-19-frontend-on-course-gps.md` |

## Documentation discipline (standing directive)

Document the journey to a working application as we go — the repo should always tell the story of how we got here. This is required, not optional:

- **Every slice follows spec → plan → build.** A feature starts as a dated design spec in `docs/superpowers/specs/`, becomes a dated plan in `docs/superpowers/plans/`, then gets built. No building ahead of an approved spec.
- **Keep decision logs current.** When a real decision is made (stack, scope, a trade-off, a deferral), append a dated entry to the relevant spec's decision log. Convert relative dates to absolute.
- **Mark plans done when done.** When a plan is fully implemented and verified, add a ✅ STATUS banner at its top summarizing what was verified (files, tests, what runs).
- **Docs reflect reality.** If code diverges from a spec, update the spec (or log the divergence) — don't leave docs stale. **This file included** — refresh it at the end of a slice.

## Build order (pillars, one slice at a time)

1. **Club & shot analysis** (range engine) — *v1, the foundation.* ✅ Built (backend + frontend).
2. **On-course GPS + OpenStreetMap course management** — ✅ Built (backend + frontend).
3. **Score / stats / handicap logging** — Backend and frontend implemented. Tee ratings, per-hole stat detail, past-round entry, personal Handicap Index, and dashboard integration.
4. Learning profile + recommendations (north star: strokes gained) — later.

Each later pillar gets its own spec → plan → build cycle. Don't pull future-pillar work into the current slice.

## Stack

| Layer | Choice |
|---|---|
| API | FastAPI (Python ≥3.12), Pydantic v2 |
| DB | SQLite via SQLAlchemy 2.0 (typed `Mapped`/`mapped_column`); Postgres-ready (config-only swap) |
| Migrations | Alembic (`backend/alembic/`) |
| Stats | pandas, pure functions in `app/stats/` |
| Auth | JWT bearer; passlib[bcrypt] (bcrypt pinned `<4.1`); admin-created accounts only |
| Backend tests | pytest + httpx TestClient |
| Frontend | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS 3 |
| Data fetching | TanStack Query |
| Routing | React Router |
| Maps | Leaflet + react-leaflet |
| Frontend tests | Vitest + Testing Library (jsdom) |
| Packaging | Docker Compose — SPA built at image build time, served single-origin by FastAPI |

## Layout

```
backend/app/
  main.py            FastAPI app, lifespan bootstraps admin; mounts API at /api + serves SPA
  config.py          Settings (env-driven): secret_key, admin_*, database_url
  database.py        Base, engine, SessionLocal, get_db()
  security.py        hash/verify password, create/decode JWT
  deps.py            get_current_user / get_current_admin
  seed.py            create_user (also seeds standard bag), bootstrap_admin
  standard_bag.py    default clubs seeded per new user
  models/            User, Club, RangeSession, Shot, Course, Hole, Round, RoundHole, TeeSet, TeeRating
  schemas/           Pydantic in/out per resource
  routers/           auth, admin, clubs, sessions, shots, stats, courses, rounds, tees
  stats/engine.py    compute_club_stats, compute_gapping (derived, never stored)
  stats/geo.py       haversine / geo helpers for GPS shot measurement
  stats/round_stats.py   GIR, fairways, putts per GIR, scrambling (derived)
  stats/handicap/    WHS engine, pure functions:
                       strokes.py      stroke allocation, net double bogey, par+5, net par
                       differential.py adjusted gross score, Score Differentials, rounding
                       index.py        Handicap Index, fewer-than-20 table, soft/hard caps
                       history.py      the chronological walk (the only ordering-aware module)
backend/alembic/     migration environment; versions/ has the baseline + 3 migrations
backend/tests/       one test_*.py per router/module

frontend/src/
  api/               client.ts (fetch wrapper, token, 401 handling), types.ts, hooks.ts (TanStack Query)
  auth/              AuthContext, RequireAuth
  components/        Layout, AsyncBoundary, StatCard, RoundMap
  routes/            Login, Dashboard, Bag, ClubDetail, Gapping, LogEntry, SessionHistory,
                     Settings, CourseSearch, CourseNew, CourseDetail, LiveRound,
                     RoundHistory, RoundSummary
  vitest.setup.ts    RTL cleanup + localStorage polyfill (see note below)
```

## Commands

**Backend** — run from `backend/`. The venv lives at `backend/.venv`.

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"   # first-time setup
.venv/bin/pytest -q                          # full suite
.venv/bin/pytest tests/test_stats_engine.py  # one file
.venv/bin/uvicorn app.main:app --reload      # dev server -> http://localhost:8000/api/docs
```

**Frontend** — run from `frontend/`.

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173, proxies /api/* to :8000
npx vitest run         # unit/component tests
npx tsc -b --noEmit    # type check
npm run lint           # oxlint
```

**Full app:** `docker compose up --build` → http://localhost:8000 (API under `/api`, docs at `/api/docs`).
First run creates the admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Conventions (don't break these)

- **Distances are canonically yards** (float) everywhere in the DB and API. `unit_preference` (yards/meters) is display-only — convert in the frontend, never store meters.
- **Stats are derived, never stored.** Computed on demand from shots. Don't add aggregate columns or a cache unless data actually gets large (YAGNI).
- **Per-user isolation.** Every list/get query filters by the calling user. Ownership of a shot is checked via its parent session or round. New endpoints must scope to `current_user`.
- **No open self-signup.** Accounts are admin-created (`POST /admin/users`); bootstrap admin seeded at first run from env.
- **Enums are string-validated:** `direction ∈ {left, straight, right}`, `source ∈ {manual, launch_monitor, gps}` (`launch_monitor` still unwired), `category ∈ {wood, hybrid, iron, wedge, putter}`, round `status ∈ {in_progress, complete}`. Putter is excluded from yardage analysis.
- **A `Shot` belongs to either a range session or a round** — `session_id` and `round_id` are both nullable; exactly one is set. Round shots also carry `hole_number`. Both kinds feed club stats and gapping.
- **GPS shots measure carry + roll combined**, so they land in `total_yards`, not `carry_yards` (which is why `carry_yards` is nullable).
- **Reserved-but-not-wired fields exist on purpose** (`accuracy`, `source = launch_monitor`). Leave the seams; don't build UI/flows for them until their pillar.
- **Schema changes go through Alembic.** Add a migration for every model change and verify it applies to a fresh DB *and* on top of the existing chain. (`create_all()` was v1-only and is no longer the schema source.)
- **TDD for the stats engine.** It's pure functions over known inputs — write the failing test first (see `test_stats_engine.py`).
- **The handicap recomputes from raw hole scores on every request.** `app/stats/handicap/history.py` replays the player's rounds chronologically because Adjusted Gross Score depends on the Index established by *earlier* rounds. Never add a cached Index column or a stored differential — correcting an old round must repair every downstream number automatically.
- **Round rating is snapshotted, not looked up.** `Round.course_rating/slope_rating/course_par` are copied from the `TeeRating` at creation. Courses get re-rated; reading live would retroactively rewrite scoring history.
- **Don't "fix" a WHS constant.** Every one is cited to a rule in `specs/2026-09-03-scores-stats-handicap-design.md` §7 and was verified against the 2024 Rules of Handicapping. Counterintuitive but correct: an 18-hole score needs 10 holes (not 14); minus differentials round *toward* zero; plus handicaps give strokes back from stroke index 18; caps are inert until 20 acceptable scores; 9-hole rounds deliberately do not feed the Index.
- **Course yardages are whole yards** (`TeeSet.yardage` is `Integer`) — published scorecard figures. `Shot.carry_yards` is `Float` because it's a measured distance. Both are yards; the units rule is about never storing meters.
- **`alembic.ini` and `alembic/` must stay in the Docker image** — the app's lifespan runs migrations at startup and loads `/app/alembic.ini`.
- **`localStorage` under test:** Node 22+ ships an experimental built-in `localStorage` global that is `undefined` without `--localstorage-file` and shadows jsdom's. `vitest.setup.ts` installs an in-memory `Storage` when it's missing and clears it between tests — don't remove it or every auth-touching test fails on modern Node.
- **No vendor or agent attribution in git.** Commit messages, trailers, branch names, tags, and PR titles/bodies must not mention Cursor, Codex, Claude, Copilot, or any other agent/model, and must not include session links or agent IDs. If a hook appends a `Co-authored-by` trailer, strip it. Leave commit messages as the change only.

## API surface

All routes are served under `/api`.

**Auth & admin** — `POST /auth/login` · `GET|PATCH /auth/me` · `POST /admin/users` (admin)

**Bag** — `GET|POST /clubs` · `PATCH|DELETE /clubs/{id}`

**Range sessions** — `GET|POST /sessions` · `GET|PATCH|DELETE /sessions/{id}` · `POST|GET /sessions/{id}/shots` · `PATCH|DELETE /shots/{id}`

**Courses** — `GET /courses/library` (imported/manual course library) · `GET /courses` (OSM search, optional `bbox`) · `POST /courses` (import/manual) · `GET /courses/{id}`

**Rounds** — `POST|GET /rounds` · `GET|PATCH /rounds/{id}` · `PATCH /rounds/{id}/holes/{number}` (strokes) · `POST /rounds/{id}/shots` (GPS-measured)

**Tees & ratings** — `GET|POST /courses/{id}/tees` · `PATCH|DELETE /tees/{id}` · `PUT /tees/{id}/ratings/{scope}` (scope ∈ `18`/`front9`/`back9`) · `PUT /courses/{id}/stroke-index`

**Stats** — `GET /clubs/{id}/stats` · `GET /stats/gapping` · `GET /stats/dashboard` · `GET /rounds/{id}/stats` · `GET /stats/handicap` · `GET /stats/rounds`

## Status

Pillars 1–3 have backend/frontend implementations, including past-round entry,
handicap history, scoring trends, and practice suggestions. The approved
2026-09-24 tee/scorecard import and usability refactor is implemented.

- Official imports: RGA Public 18 (5 tees) and Lonnie Poole (12 rating-category choices). Authenticated preview/apply, signed expiring previews, conflict detection, preserved geometry, and idempotent tee identities.
- `RoundHole.stroke_index` is now snapshotted. The migration backfills existing rows. Handicap history must read that snapshot, never live `Hole.stroke_index`.
- New rounds require a complete selected scope with real pars; only selected holes are stored, and back-nine rounds start at 10. Legacy all-hole round rows remain scoped in stats/output.
- Responsive navigation and course setup, guarded unsaved live scoring, recoverable page errors, and lazy-loaded maps.
- Verified: **219 backend tests**, **171 frontend tests**, final auth/client regression checks, production build/TypeScript. Lint succeeds with one existing Fast Refresh warning. Both official parsers passed live read-only checks.
- Frontend/API health passed. No browser was connected for visual smoke; the changed Docker image was not built in this pass. See `docs/superpowers/plans/2026-09-24-tee-scorecard-import.md`.

**Next:** real-device visual/round-start smoke, offline-safe scoring and data
export/backup, then wider verified course coverage. See `docs/product-roadmap.md`.

## September 27 Play plan and personal notebook increment

Implemented **Play → Plan** with account/source-scoped offline club advice and a
private course-hole notebook. Notebook records are separate from round green notes;
`hole_notes` has a unique user/course/hole key and revision-checked updates. Migration
`g74b51e93c25` follows `a74b51e93c24`. Local drafts and pending note records survive
reload; synchronization preserves newer edits and requires conflict review. Personal
notes use a separate recovery export and block PWA updates while pending.

Verified 263 backend tests, 236 frontend tests, build/TypeScript, lint, and browser
checks for offline advice, note reload/reconnect and reuse in a new offline round.
See `docs/play-plan-notebook.md` and the dated spec/plan. Next product work: richer
course geometry; real-phone field validation remains. Server-preserved shot traces are now implemented below.

## Shot history and replay — 2026-09-27

Implemented revisioned per-round shot history, durable GPS endpoints and metadata,
manual entry, recoverable removal, conflict review, and offline vector replay.
Migration `h85c62fa4d36` follows `g74b51e93c25`. Shot edits never alter scorecards.
Removed shots must be excluded from club statistics; historical missing positions
and order stay unknown. Device merges must preserve newer edits and account isolation.
Verified 276 backend tests, 242 frontend tests, build/TypeScript, lint (two existing
Fast Refresh warnings), and isolated mobile browser offline/reconnect workflows.
See `docs/shot-history-replay.md`; real-phone field testing remains outstanding.
