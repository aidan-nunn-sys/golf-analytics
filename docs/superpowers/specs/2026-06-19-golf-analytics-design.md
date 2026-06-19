# Golf Analytics Platform — Design (living document)

> **Status:** v1 design complete — pending user review. Living doc; decisions appended as made. Directory name `golf-analytics` is a working name and can be renamed before first commit.

_Last updated: 2026-06-19_

---

## 1. Vision

A self-hosted, open-source golf analytics platform. It learns your game from the data you log and gives you sharper analysis over time. Built as four pillars, delivered in slices:

1. **Club & shot analysis (range/practice engine)** — log shots per club, derive stock yardages, gapping, consistency, dispersion, and trends. _← built first; the foundation everything else reads from._
2. **On-course GPS tracking & course management** — render courses from OpenStreetMap, GPS distances, drop-a-pin shot measuring, club recommendations.
3. **Score & stats logging (the backlog)** — enter past rounds (full hole-by-hole or total-only), per-course history, handicap, fairways/GIR/putts stats.
4. **Learning profile (the brain)** — aggregates everything into one player profile (real stock yardages, tendencies, strengths/weaknesses) that powers recommendations.

A possible long-term north-star analytic: **strokes gained** (tee / approach / short game / putting). Not in early scope; noted as a direction.

## 2. Audience & constraints

- **Users:** the owner + friends/family. Small multi-user. Each user has their own isolated data ("bag").
- **Deployment:** self-hosted (Docker). No cloud lock-in.
- **Licensing:** open-source on GitHub (license TBD).
- **Goal:** also a learning project — favor a clear, well-documented, not-over-engineered codebase.
- **Out of scope:** native iOS/Android apps / app stores. **Web only.**

## 3. Build order

Pillar 1 (Club & shot analysis) is the heart and is built first as v1. Pillars 2–4 follow in later slices, each with its own spec → plan → implementation cycle.

## 4. Architecture & stack (approved)

API-first: a clean JSON API with the web app as its first client.

| Layer | Choice | Notes |
|---|---|---|
| API | **FastAPI** (Python) | async, Pydantic validation, auto-generated interactive docs |
| Database | **SQLite**, Postgres-ready | single-file, easy self-host/backup; via SQLAlchemy ORM, Postgres swap is config-only |
| Stats engine | **pandas / numpy** | averages, medians, consistency, gapping math in a small testable module |
| Front end | **React + Vite + TypeScript** | consumes the JSON API |
| Auth | email + password (hashed), token-based | per-user data isolation |
| Packaging | **Docker Compose** | `docker compose up` to run |

Supporting tooling: **SQLAlchemy** ORM + **Alembic** migrations; **pytest** for the backend (the derived-stats module is the prime candidate for test-driven development — pure functions over known inputs). Repo ships with a README and `docker-compose.yml` for one-command self-hosting; license TBD before first public push.

Fallback noted: if a React SPA feels like too much frontend for a solo self-host project, server-rendered HTMX is an easy alternative (no longer constrained by a mobile target).

## 5. Shot input methods

The data model records *how* a shot was measured and how accurate it is. Build order:

1. **Manual entry** (you estimate via range markers/pacing) — v1 core.
2. **Launch monitor import** (Garmin R10, Mevo+, Trackman, etc.; CSV/entry) — later.
3. **GPS-measured** (mark spot, walk to ball, compute distance) — later; reuses Pillar 2 GPS tech.

## 6. Data model (approved)

Field tiers keep entry fast: **required** = club + distance; **one-tap optional** = direction; **conditions live at session level**, not per shot.

**User** — account; owns everything.
- `email`, `password_hash`, `display_name`, `unit_preference` (yards/meters — stored canonically, displayed per preference), `created_at`

**Club** — one per club in the bag.
- `label` ("7 Iron", "4 Hybrid", "58°"), `category` (wood/hybrid/iron/wedge/putter — grouping & order), `order_index`, optional `loft`, optional `brand_model`, `is_active`
- Signup pre-seeds a **standard bag** (Driver → wedges); user adds/removes/renames/reorders. Putter excluded from yardage analysis.

**Session** — one range visit; groups shots, holds conditions.
- `date`, optional `name`/`location`, optional `surface` (mat/grass), optional `wind`, optional `temperature`, optional `notes`

**Shot** — one ball struck.
- `club_id`, `carry_yards` (filled by manual entry), optional `total_yards`, `direction` (left/straight/right), `source` (manual/launch_monitor/gps), optional `accuracy`, `created_at`

**Stats — derived, not stored.** A pandas module computes per-club on demand: count, average + median carry, consistency (std dev/spread), min/max, direction split (% L/S/R). Gapping = clubs ordered by avg carry with gaps between consecutive. Rationale: avoids staleness (single source of truth), trivially cheap at this scale, and allows arbitrary slicing on demand. Cache/precompute only if data ever gets large (YAGNI).

## 7. v1 scope (Club & shot analysis)

### Screens
1. **Log entry (core flow)** — start session (date auto, conditions optional) → rapid entry: tap club → type distance → optional direction → Add; live editable shot list. Entry speed is the priority.
2. **My Bag** — pre-seeded clubs; add/remove/rename/reorder, set category & loft.
3. **Club detail** — per club: avg + median carry, consistency, min/max, direction split (L/S/R), count, recent shots, trend over time.
4. **Gapping** — clubs stacked by avg carry as a distance ladder; gaps and overlaps flagged.
5. **Session history** — past sessions; drill into one.
6. **Dashboard** — stock yardages at a glance + recent activity; landing page.

### Auth
- **Invite / admin-created** accounts. No open self-signup.
- **Bootstrap admin**: first account created at first run (e.g., via env vars / first-run setup). Admin then creates accounts or issues invite links.
- Token-based sessions; passwords hashed (passlib/bcrypt). Per-user data isolation.

### In scope (v1)
- Auth (invite/admin) + bag CRUD + session-based manual shot logging (edit/delete) + derived stats (club detail, gapping, dashboard) + session history + unit preference.

### Out of scope (v1) — fields/seams exist, UI later
- Launch-monitor import & GPS-measured entry (the `source`/`total_yards`/`accuracy` fields exist; only `manual` is wired up).
- Pillar 2 (on-course GPS / OpenStreetMap course management).
- Pillar 3 (score/handicap/round-stat logging).
- Pillar 4 (recommendations engine, strokes gained).
- Native mobile apps.

## 8. Roadmap (later slices, each its own spec → plan → build)
- **Pillar 1.1** — launch-monitor import (CSV) + GPS-measured shots.
- **Pillar 2** — on-course GPS tracking & OpenStreetMap course management.
- **Pillar 3** — score & stats logging (backlog rounds, handicap, GIR/fairways/putts).
- **Pillar 4** — learning profile, club recommendations, strokes gained.

## 9. Decision log

- 2026-06-19 — Pillar 1 (club/shot analysis) chosen as first slice.
- 2026-06-19 — Audience: self-host, small multi-user, open-source, learning project.
- 2026-06-19 — All three input methods wanted; manual entry first.
- 2026-06-19 — Stack: FastAPI + SQLite + React/Vite/TS + pandas/numpy + Docker Compose.
- 2026-06-19 — App-store / native mobile dropped from scope; web-only.
- 2026-06-19 — Per-shot: club + distance required, direction one-tap optional, conditions at session level. Capture-all supported via tiered fields.
- 2026-06-19 — Data model approved (User / Club / Session / Shot). Sessions explicit; direction 3-way; manual fills carry, total optional.
- 2026-06-19 — Stats are derived (computed on demand via pandas), not stored. Cache only if data grows large (YAGNI).
- 2026-06-19 — Accounts: invite/admin-created (no open self-signup); bootstrap admin at first run.
- 2026-06-19 — v1 screens approved: Log entry, My Bag, Club detail, Gapping, Session history, Dashboard.
- 2026-06-19 — v1 wires up `manual` shot source only; launch-monitor/GPS deferred (fields reserved).
