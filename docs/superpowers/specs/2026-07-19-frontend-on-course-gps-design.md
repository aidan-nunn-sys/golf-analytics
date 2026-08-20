# On-Course GPS Frontend (Pillar 2 frontend) — Design

Builds directly on `docs/superpowers/specs/2026-07-11-on-course-gps-course-management-design.md`
(the Pillar 2 backend spec), which already sketched the route table, stack
addition (Leaflet), and error-handling posture this doc formalizes. Follows
the same architecture as `docs/superpowers/specs/2026-06-30-frontend-club-shot-analysis-design.md`
(Pillar 1 frontend) — same app, new routes, not a new project.

## 1. Goal & scope

Give the already-merged Pillar 2 backend (courses, rounds, GPS shot logging)
a usable UI: search/import a course, start a round, log shots via GPS while
playing, enter strokes per hole, and review a scorecard. Extends the
existing React SPA in place.

## 2. Stack

Same as Pillar 1: React + Vite + TypeScript, Tailwind, TanStack Query,
React Router, Vitest. One addition: `react-leaflet` + `leaflet` for the live
round map (approved in the backend spec's stack-additions section). No new
state library — TanStack Query for server state, component state for the
in-progress two-tap GPS capture.

## 3. Architecture

New routes added to the existing `App.tsx` route tree (inside the same
`RequireAuth` + `Layout` shell Pillar 1 uses):

| Route | Screen | Purpose |
|---|---|---|
| `/courses` | Course search | Search box → Overpass results → import; "Add manually" link |
| `/courses/new` | Add course manually | Name + per-hole number/par form → `POST /courses` |
| `/courses/:id` | Course detail | Hole list, par; "Start round" (or "Resume round" if one's already `in_progress` on this course) |
| `/rounds` | Round history | List past + in-progress rounds, in-progress surfaced first; drill into scorecard or resume |
| `/rounds/:id` | Live round | Map, GPS shot logging, strokes entry, hole advance |
| `/rounds/:id/summary` | Scorecard | Strokes/hole, running total, vs-par; marks `completed` |

Nav gets a new top-level "Rounds" link alongside Bag/Sessions/etc.

New `api/` additions mirror the existing pattern: types for `Course`,
`Hole`, `Round`, `RoundHole` in `types.ts`; TanStack Query hooks
(`useCourseSearch`, `useCourse`, `useImportCourse`, `useCreateManualCourse`,
`useRounds`, `useRound`, `useCreateRound`, `useUpdateRound`,
`useUpdateRoundHole`, `useLogRoundShot`) in `hooks.ts`.

## 4. Data flow — Live round GPS mechanics

- **Position tracking:** `navigator.geolocation.watchPosition` while the
  Live Round screen is mounted, cleaned up on unmount. Continuous, not
  poll-on-tap — the screen's point is a live distance-to-pin readout, and
  `watchPosition` is a native platform feature, not custom code.
- **Distance to pin:** current watched position vs. the current hole's green
  centroid (`green_lat`/`green_lng`, already populated from the OSM import),
  computed client-side, displayed live (e.g. "142y to green").
- **Two-tap shot logging:**
  1. **"Mark shot start"** — captures current GPS position as
     `start_lat/lng` (component state only, not yet sent).
  2. **"I'm at my ball"** — captures current GPS position as `end_lat/lng`,
     prompts for club (required) + direction (optional, defaults
     `straight`), then fires `POST /rounds/:id/shots`. The server computes
     `carry_yards` server-side (`haversine_yards`) — the client never
     computes or sends a distance.
- **Map:** react-leaflet centered on the current hole's green (falls back to
  the course's `location_lat`/`location_lng` if the hole has no green data —
  there's no tee coordinate in the data model to fall back to, corrected
  during implementation). If `course.import_source === "manual"` (no geo
  data at all), the map is omitted entirely — strokes-only entry.
- **Strokes + hole advance:** number input per hole
  (`PATCH /rounds/:id/holes/:number`); "Next hole" advances `current_hole`
  (`PATCH /rounds/:id`); on the last hole the button becomes "Finish round"
  and navigates to `/rounds/:id/summary`.
- **Resume-active-round nudge:** `/courses/:id`'s "Start round" checks round
  history for an `in_progress` round on that course; if one exists, shows
  "Resume round" instead of creating a new one via `POST /rounds`. UI nudge
  only — the backend has no uniqueness constraint, so this doesn't prevent
  multiple in-progress rounds, it just steers the common path.
- **Geolocation denied/unavailable:** map and distance-to-pin hide behind an
  inline "location unavailable" message. Strokes entry still works, but
  **shot-level GPS logging does not** — the backend requires
  `start_lat/start_lng/end_lat/end_lng` on every round shot, so there's no
  club-only fallback; a round with no location access is scored by hole
  only.

## 5. Error handling

- Overpass search errors/timeouts surface as a normal inline error state,
  no retry-with-backoff beyond the backend's own `httpx` defaults.
- Manual-entry form: client-side validation (name required, at least one
  hole, par per hole) before submit; the backend's 422 for a zero-hole
  course is surfaced as a form-level error if it somehow gets past client
  validation.
- No offline support — a dropped connection during a round is a normal
  failure/retry, no local queue or background sync. Known limitation
  (courses often have weak cell signal), consistent with the rest of the
  app having no offline infrastructure either.

## 6. Testing

Mirrors Pillar 1: Vitest unit/component tests, `tsc -b --noEmit`, no e2e
framework. `navigator.geolocation` is mocked in tests the same way API
calls are already mocked. Specific coverage worth calling out (the branchy
bits, not just the happy path):
- Resume-active-round nudge (existing `in_progress` round found vs. not).
- Geolocation-denied fallback (map/distance hidden, strokes-only, no shot
  logging offered).
- Manual course entry form validation.

## 7. Out of scope

Unchanged from the backend spec's §8, reaffirmed here: club recommendations
during a round (Pillar 4), fairways/GIR/putts/handicap (Pillar 3), hazard
display, editing imported OSM geometry, offline support. Also explicitly
out of scope for this slice: the deferred stats/gapping inclusion decision
(spec `2026-07-11...`, decision log 2026-07-15) stays deferred — the live
round and scorecard screens show only round-native data (strokes, par, GPS
shots as logged), no club stats pulled in.

## 8. Decision log

- **2026-07-19** — Scoped in a manual "add course" form for this slice
  (rather than deferring it) — the backend already supports it
  (`POST /courses` with hand-entered holes), and covering courses missing
  from OSM was judged worth the form-building cost now rather than leaving
  OSM-import as the only path.
- **2026-07-19** — No backend constraint added for "one active round at a
  time" — handled as a UI nudge only (resume-round suggestion), not a hard
  rule, to avoid backend changes outside this frontend slice's scope.
- **2026-07-19** — Confirmed: without geolocation permission, round shots
  cannot be logged at all (only strokes-per-hole), since the backend
  requires GPS coordinates on every `POST /rounds/{id}/shots` call. No
  club-only fallback shot path was added — out of scope for this slice.
- **2026-07-19** — Corrected §4: the "falls back to tee" map-centering
  behavior described in the original design was never buildable — `Hole`
  has no tee coordinate field, only `green_lat`/`green_lng` (confirmed
  against `backend/app/schemas/course.py::HoleOut` during Task 8). Falls
  back to the course's `location_lat`/`location_lng` instead.
