# On-Course GPS & Course Management (Pillar 2) — Design

> **Status:** v1 design — approved, pending written-spec review. Builds on the completed Pillar 1 backend + frontend (`docs/superpowers/specs/2026-06-19-golf-analytics-design.md`).

_Last updated: 2026-07-11_

---

## 1. Goal & scope

Live, on-course rounds: pick or import a golf course, walk it while the app tracks GPS position and shows distance to the green, log GPS-measured shots (mark → walk → mark), and record a basic per-hole score. This is the second of the four pillars in the main design doc's roadmap (§8) and gets its own spec → plan → build cycle per repo convention.

The main design doc's vision section (§1) mentions "club recommendations" under Pillar 2; the roadmap section (§8) puts recommendations under Pillar 4. This spec resolves that in favor of the roadmap: recommendations need the learning profile's stock-yardage data (Pillar 4) to mean anything, so they're deferred. This slice only shows live distance-to-pin.

## 2. Stack additions

| Concern | Choice |
|---|---|
| Course geometry source | OpenStreetMap via the Overpass API, queried server-side |
| Map rendering (frontend) | Leaflet + `react-leaflet`, OSM raster tiles |
| Live position (frontend) | Browser Geolocation API (`watchPosition`) |
| Distance math (backend) | Haversine, pure function alongside the existing `app/stats/` module |

No new backend dependencies beyond an HTTP client for Overpass (`httpx`, already a FastAPI transitive dependency). No new frontend dependencies beyond `leaflet`/`react-leaflet`.

## 3. Data model

New tables, kept separate from Pillar 1's `RangeSession`/`Shot` (a range visit and an on-course round are different enough — mat/grass/wind vs. holes/par/live GPS — that merging them would mean bolting course-round fields onto an already-shipped, tested model for no shared benefit):

**Course** — shared/global reference data, not per-user. A real-world course is a fact, not one user's private data, so (unlike Club/Session/Shot) it isn't scoped to `current_user`.
- `name`, `osm_id` (nullable — null for manually-added courses; unique when set, used to dedupe re-imports), `import_source` (`osm` | `manual`), `location_lat`/`location_lng` (for search-result map centering), `imported_at`

**Hole** — belongs to a Course.
- `course_id`, `number`, `par`, `green_lat`/`green_lng` (nullable — only set for `osm`-sourced courses with mapped greens), `hazards` (nullable JSON list of `{type: "bunker"|"water", lat, lng}` — a single JSON column, not a normalized table, since it's read-only imported data with no query need to justify one)

**Round** — per-user, scoped to `current_user` like everything else in Pillar 1.
- `user_id`, `course_id`, `date`, `status` (`in_progress` | `completed`), `current_hole`

**RoundHole** — one row per hole played in a round.
- `round_id`, `hole_id`, `par` (copied from Hole at round start, so a later par correction on Course doesn't rewrite past scorecards), `strokes` (nullable until entered)

**Shot** (existing Pillar 1 table) — gains a nullable `round_id` alongside its existing session tie, and a nullable `hole_number` (plain int, not a `RoundHole` FK — it's just "which hole was this GPS shot logged on," denormalized for simplicity rather than joined by timestamp). A GPS shot during a round reuses the existing table (`club_id`, `carry_yards`, `direction`, `source="gps"`, `accuracy`), so club stats/gapping already include on-course shots with no changes to `app/stats/engine.py`.

**Note for the implementation plan:** `Shot.session_id` is currently non-nullable (`backend/app/models/shot.py`). It needs to become nullable — a shot now belongs to *either* a session *or* a round, not necessarily both. The repo has no Alembic yet (v1 convention is `create_all()`), so this is a plain model-column change, but it's worth flagging explicitly since it touches an already-shipped, tested Pillar 1 table.

## 4. OSM import flow

1. User searches by name/location in the frontend.
2. Backend queries the Overpass API for matching `golf_course` areas and their child ways (`golf=hole`, `golf=green`, `golf=bunker`, `golf=water_hazard`) within each match's boundary.
3. Backend parses the response into Course + Hole rows (green centroid computed from the `golf=green` way if present; `par` from the hole's `par` tag if present, else left null for manual entry).
4. If a course with that `osm_id` is already imported, return the cached copy instead of re-querying Overpass.
5. If Overpass returns a course boundary but no `golf=hole` ways (common for smaller/private courses), the search result is flagged as "no hole data" and the frontend offers **manual add** instead: user enters hole count + par per hole, `import_source="manual"`, no geometry. Rounds on a manual course skip the map and live distance-to-pin; GPS shot-measuring (a pure two-GPS-point distance) still works since it doesn't depend on course geometry at all.

## 5. Screens (routes)

| Route | Screen | Notes |
|---|---|---|
| `/courses` | **Course search** | Search box → Overpass results (with hole-count found) → import; or "add manually" |
| `/courses/:id` | **Course detail** | Hole list, par; "Start round" |
| `/rounds/:id` | **Live round** (the core screen) | Leaflet map centered on `current_hole` (if geo data exists) with live GPS marker + distance-to-green; if `import_source="manual"`, no map — just the strokes input. "Mark shot start" / "I'm at my ball" two-tap flow logs a GPS shot (club + optional direction prompt on the second tap). Strokes input per hole. "Next hole" advances `current_hole` |
| `/rounds/:id/summary` | **Scorecard** | Strokes per hole, running total, vs-par; marks `status="completed"` |
| `/rounds` | **Round history** | List past rounds → drill into scorecard, mirrors Pillar 1's Session history pattern |

## 6. API surface

`GET /courses?search=` (proxies Overpass) · `POST /courses` (import OSM result, or manual) · `GET /courses/{id}` · `POST /rounds` (start — creates the Round + one RoundHole per Hole) · `GET /rounds` (history, scoped to `current_user`) · `GET|PATCH /rounds/{id}` (advance `current_hole`, mark completed) · `PATCH /rounds/{id}/holes/{n}` (strokes) · `POST /rounds/{id}/shots` (GPS shot logging, mirrors the existing `POST /sessions/{id}/shots` shape with `round_id` + `hole_number` instead of `session_id`).

Courses are unauthenticated-read (any logged-in user) but still require auth like every other endpoint; there's no per-user course ownership to check.

## 7. Error handling

- Geolocation permission denied or unavailable → live map/distance-to-pin disabled with an inline message; strokes entry and the manual-course flow are unaffected, since score-keeping never depends on GPS.
- GPS shot distance is stored with the browser's reported accuracy in Pillar 1's existing (previously unwired) `Shot.accuracy` field.
- No offline support: a standard SPA failure/retry on a dropped connection, no local queue or background sync. Flagged explicitly since golf courses often have weak cell signal — accepted as a known limitation for this slice rather than building offline infrastructure (service worker, local queue, conflict handling) that the rest of the app doesn't have either.
- Overpass API errors/timeouts on search surface as a normal error state; no retry-with-backoff beyond what `httpx` defaults give.

## 8. Out of scope (deferred to later pillars or later slices)

- Club recommendations / stock-yardage suggestions during a round → Pillar 4 (needs the learning profile).
- Fairways hit, GIR, putts, handicap → Pillar 3 (score/stats logging).
- Hazard polygons / front-back-of-green precision → centroids only for now.
- Editing or correcting imported OSM geometry from within the app.
- Offline support.

## 9. Decision log

- 2026-07-11 — Pillar 2 scoped as a tightly-coupled slice: course rendering (OSM import) and GPS shot-measuring built together, since they share the same on-course UX rather than being sequenced separately.
- 2026-07-11 — Live round mode chosen over a reference-only lookup: GPS tracking and shot logging happen within an in-progress `Round`, not as a standalone measuring tool.
- 2026-07-11 — Basic score entry (strokes per hole only, no putts/fairways/GIR) pulled forward into this slice despite belonging conceptually to Pillar 3, because a live round without any score felt incomplete. Fairways/GIR/putts/handicap remain out of scope and stay Pillar 3's.
- 2026-07-11 — Course data sourced via server-side Overpass API queries against OpenStreetMap, cached in a new shared (non-per-user) `Course`/`Hole` table on first import.
- 2026-07-11 — Map rendering: Leaflet + `react-leaflet` with OSM raster tiles, over MapLibre GL — no API key, lighter weight, sufficient for a self-hosted low-traffic app.
- 2026-07-11 — Round/Hole data kept as new tables separate from Pillar 1's `RangeSession`; on-course `Shot` rows reuse the existing `Shot` table via a new nullable `round_id` + `hole_number`. (Correction, 2026-07-15: this line originally claimed stats/gapping "automatically include on-course shots" — that has not held up; see the 2026-07-15 entry below.)
- 2026-07-11 — Distance-to-pin/hazard computed from single lat/lng centroids, not full green/hazard polygons — front/center/back-of-green precision deferred as post-MVP polish.
- 2026-07-11 — Club recommendations during a round explicitly deferred to Pillar 4, resolving a contradiction between the main design doc's vision section (§1, mentions recommendations under Pillar 2) and its roadmap section (§8, puts them under Pillar 4) in favor of the roadmap.
- 2026-07-11 — Courses without OSM hole-level data get a manual-entry fallback (hole count + par, no geometry) rather than being unimportable, so any course can host a round even if it degrades to no-map/no-live-distance.
- 2026-07-11 — No offline support for this slice; connectivity loss mid-round is a known, accepted limitation rather than new scope (service worker/local queue).
- 2026-07-11 — Courses are shared/global across all users on a server (not per-user private data) since a course is real-world reference data, not personal golf data — this is a deliberate, narrow exception to the per-user-isolation convention, which continues to apply to Rounds, Shots, Clubs, and Sessions.
- 2026-07-13 — `search_courses`'s unbounded global name query times out against the public overpass-api.de instance (confirmed query-cost, not a syntax error — a bbox-bounded variant of the same query succeeds in ~1.6s). Task 6's `GET /courses?search=` endpoint will need a bbox/viewport parameter (or an equivalent scoping constraint) rather than a bare name filter.
- 2026-07-19 — Closed the above: `GET /courses` now accepts optional `min_lat`/`min_lng`/`max_lat`/`max_lng` query params, forwarded to `overpass.search_courses` as a bbox filter on the Overpass QL. Optional (not required) since no frontend exists yet to supply a map viewport — unbounded search still works for now but keeps the documented timeout risk until the frontend pillar wires a real bbox through.
- 2026-07-15 — Task 8's on-course shot logging (`POST /rounds/{id}/shots`) computes `Shot.carry_yards` as the straight-line ground distance between two raw GPS points (start-of-swing → ball-at-rest), i.e. carry + roll combined. Pillar 1's `carry_yards` on range shots is true ball-flight carry (manually entered) — a different physical quantity in the same column. Separately, `backend/app/routers/stats.py::_shots_for_club` INNER JOINs `Shot` to `RangeSession`, so round shots (`session_id IS NULL`) are currently excluded from `/clubs/{id}/stats`, `/stats/gapping`, and `/stats/dashboard` entirely — today this is a silent no-op, not a corruption, but it means on-course shots do **not** yet flow into stats/gapping as originally stated above. **Open decision, not yet made:** should on-course shots feed stats/gapping at all, and if so, does GPS ground-distance get stored in the reserved (currently unused) `total_yards` column instead of `carry_yards`, with a separate query path scoped via `Round.user_id` rather than `RangeSession.user_id`? Deferred — flagging for the user before this branch merges; not addressed by any task in this plan.
- 2026-08-26 — Resolved the above: on-course GPS shots now store ground-distance in `total_yards` (`carry_yards` is `null` for them; the column is now nullable). `stats.py::_shots_for_club` unions the existing `RangeSession`-scoped query (using `carry_yards`) with a new `Round`-scoped query (using `total_yards`), so round shots feed `/clubs/{id}/stats`, `/stats/gapping`, and `/stats/dashboard` alongside range shots. Migration `f3a1c9b2d7e4`.
- **2026-07-12** — Introduced Alembic to manage schema changes, starting with this slice
  (baseline migration + a migration adding `courses`/`holes`/`rounds`/`round_holes` and
  altering `shots` for nullable `session_id` + new `round_id`/`hole_number`). Chosen over a
  one-off SQL patch or accepting data loss because the owner's real `golf.db` already has
  logged range shots. `render_as_batch=True` handles SQLite's inability to `ALTER COLUMN`
  nullability in place. Existing pre-Alembic databases need a one-time
  `alembic stamp <baseline_revision>` before their first restart on this version.
- **2026-07-12** — GPS shot distance is computed server-side: `POST /rounds/{id}/shots`
  accepts two raw GPS points (start/end) and the backend computes `carry_yards` via a new
  `haversine_yards()` function, rather than trusting a client-computed value. Keeps distance
  math authoritative in one place.
- **2026-07-12** — Overpass hazard-to-hole association (`Hole.hazards`) is left `null` on
  import. Hole number/par and green-centroid come from documented OSM tag conventions
  (`golf=hole` `ref`/`par`, `golf=green` matched by shared `ref`) that can be tested with a
  mock. Hazard-to-hole matching would need spatial nearest-hole logic with no way to write a
  truthful test for the "correct" answer — deferred rather than shipped unverified. The
  `hazards` column stays in the schema for a future pass.
