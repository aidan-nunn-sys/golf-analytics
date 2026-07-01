# Golf Analytics Frontend (Pillar 1) — Design

> **Status:** v1 design — approved, pending written-spec review. This is "Plan 2" referenced by the backend plan. Builds the React web client for the Club & Shot Analysis API.

_Last updated: 2026-06-30_

---

## 1. Goal & scope

A React single-page web app that is the first (and v1 only) client of the existing Golf Analytics JSON API. It lets the owner + friends/family log range shots and read their derived stats. Entry speed on the log screen is the priority. Web only, self-hosted alongside the API.

The backend (accounts, bag, sessions, manual shots, derived stats) is complete and unchanged by this slice. This spec adds only the frontend; if a backend gap surfaces (e.g. CORS for production serving), it is called out here, not silently expanded.

## 2. Stack (approved)

| Concern | Choice |
|---|---|
| Framework / build | React + Vite + TypeScript |
| Styling | Tailwind CSS |
| Server state / fetching | TanStack Query (React Query) |
| Routing | React Router |
| Auth token | `localStorage` |
| Dev API access | Vite dev-server proxy to `:8000` (no CORS in dev) |

New top-level `frontend/` directory. The API stays the source of truth; the client holds no business logic beyond display formatting.

## 3. Architecture

```
frontend/
  index.html
  vite.config.ts          dev proxy: /api -> http://localhost:8000
  tailwind.config.js
  src/
    main.tsx              Router + QueryClientProvider + AuthProvider
    api/
      client.ts           fetch wrapper: base URL, inject Bearer token, throw ApiError on !ok
      types.ts            TS types mirroring API schemas (User, Club, Session, Shot, stats)
      hooks.ts            TanStack Query hooks: queries + mutations, one per resource group
    auth/
      AuthContext.tsx     token in localStorage; login/logout; current user; isAuthed
      RequireAuth.tsx     route guard -> redirect to /login
    units.ts              yards<->meters display conversion (pure; reads unit_preference)
    components/
      Layout.tsx          nav shell (links to the screens), used by all authed routes
      ClubPicker.tsx      tap-to-select club control (log entry)
      ShotRow.tsx         one shot in the editable list
      StatCard.tsx        labelled stat value
      AsyncBoundary.tsx   shared loading / error / empty rendering for a query
    routes/
      Login.tsx
      Dashboard.tsx
      LogEntry.tsx
      Bag.tsx
      ClubDetail.tsx
      Gapping.tsx
      SessionHistory.tsx
      Settings.tsx
```

**Unit boundaries:**
- `client.ts` — the only place that talks HTTP. Knows the token, throws a typed `ApiError`. Doesn't know React.
- `hooks.ts` — the only place components fetch through. Owns query keys and cache invalidation. Components never call `client.ts` directly.
- `AuthContext` — owns the token and the current user. Everything else reads `isAuthed` / `user`.
- `units.ts` — pure conversion, independently testable.
- Each `routes/*` screen composes hooks + components; it holds layout, not data logic.

## 4. Data flow

1. Component renders → calls a Query hook (`useDashboard()`, `useClubs()`, …).
2. Hook → `client.ts` → API (proxied in dev). React Query caches by key, exposes `{data, isLoading, error}`.
3. `AsyncBoundary` renders loading / error / empty uniformly so screens stay focused on the happy path.
4. Mutations (`useLogShot`, `useUpdateClub`, …) call the API, then invalidate the affected query keys so dependent views (dashboard, club detail, gapping) refetch automatically.
5. Any response that is HTTP 401 → `AuthContext` clears the token and redirects to `/login`.

## 5. Screens (each a route)

All except `/login` are wrapped in `RequireAuth` + `Layout`.

| Route | Screen | Primary API calls |
|---|---|---|
| `/login` | Email + password → store token | `POST /auth/login`, then `GET /auth/me` |
| `/` | **Dashboard** (landing): stock yardages + recent activity | `GET /stats/dashboard`, `GET /sessions` |
| `/log` | **Log entry**: pick/create session → ClubPicker → carry input → optional L/S/R → Add; live editable shot list | `GET\|POST /sessions`, `POST /sessions/{id}/shots`, `GET /sessions/{id}/shots`, `PATCH\|DELETE /shots/{id}`, `GET /clubs` |
| `/bag` | **My Bag**: add/remove/rename/reorder clubs, set category/loft | `GET\|POST /clubs`, `PATCH\|DELETE /clubs/{id}` |
| `/clubs/:id` | **Club detail**: avg/median carry, consistency, min/max, direction split, recent shots | `GET /clubs/{id}/stats`, `GET /clubs` |
| `/gapping` | **Gapping**: distance ladder by avg carry; flag gaps/overlaps | `GET /stats/gapping` |
| `/sessions` | **Session history**: list past sessions; drill into one | `GET /sessions`, `GET /sessions/{id}`, `GET /sessions/{id}/shots` |
| `/settings` | **Settings**: display name, yards/meters | `GET\|PATCH /auth/me` |

Admin account-creation (`POST /admin/users`) is **out of v1 frontend scope** — admins use `/docs` for now; a UI can come later. (Called out so it isn't assumed missing.)

**Log entry detail (the priority screen):** on load, default to today's most recent session or offer "Start session" (date defaults to today, conditions optional). Club select is tap/click, carry is a numeric field, direction is a 3-way toggle defaulting to straight, Add is one action and keeps focus for the next shot. The shot list below is editable in place (edit carry/direction, delete).

## 6. Units

API is always yards. `units.ts` converts to the user's `unit_preference` for display, and converts user input back to yards before any write. Meters is never persisted. One pure module, unit-tested.

## 7. Error handling

- `client.ts` throws `ApiError {status, message}` on non-2xx; never returns a half-parsed body.
- React Query surfaces per-view error/loading via `AsyncBoundary` — inline messages, no white screens.
- 401 anywhere → logout + redirect to `/login`.
- Forms validate against the API enums client-side (`direction ∈ left|straight|right`, `category ∈ wood|hybrid|iron|wedge|putter`) for fast feedback; the API remains the authority and its 422s are shown if they slip through.

## 8. Testing

Vitest + React Testing Library, focused on the two pieces with real logic:
- `units.ts` — conversion round-trips and edge values.
- **Log-entry form** — add a shot, edit a shot, direction defaults, keyboard flow. (The highest-value, most-logic screen.)

Everything else is mostly wiring over the API and is left untested per YAGNI; add tests if a screen grows real logic. No full per-component suite.

## 9. Dev & build / deploy

- **Dev:** `npm run dev` (Vite) with a proxy: requests to `/api/*` → `http://localhost:8000/*`. Backend runs separately (`uvicorn` or the container). No CORS needed in dev.
- **Prod (self-host):** `npm run build` emits static assets. Serve them either (a) from the FastAPI app via a static-files mount, or (b) as a second container behind the same origin. Chosen in the implementation plan; if cross-origin serving is selected, the backend needs CORS middleware — the one possible backend change this slice could require, flagged here.

## 10. Out of scope (unchanged from product spec)

Launch-monitor import / GPS-measured UI (API fields stay hidden), Pillars 2–4, native mobile, admin user-management UI. Reserved API fields (`total_yards`, `accuracy`, non-`manual` source) are not surfaced.

## 11. Decision log

- 2026-06-30 — React SPA chosen over the HTMX fallback (learning value + API-first split for future clients).
- 2026-06-30 — Stack: React + Vite + TS, Tailwind, TanStack Query, React Router; token in `localStorage`; Vite proxy in dev.
- 2026-06-30 — v1 frontend = the 6 product screens + Login + Settings. Admin user-creation UI deferred (use `/docs`).
- 2026-06-30 — Tests scoped to `units.ts` + the log-entry form; rest is wiring (YAGNI).
- 2026-06-30 — Production static-serving strategy (FastAPI mount vs second container) deferred to the implementation plan; CORS only needed if cross-origin is chosen.
- 2026-06-30 (plan) — Resolved: single-origin. API is served under `/api`; the SPA is served at `/` by FastAPI in production. Client always calls `/api/...`; Vite dev proxies `/api`→`:8000` (strips prefix). This avoids SPA-route/API-route collisions (`/sessions`, `/clubs/:id`) and needs no CORS. Cost: backend routers move under an `/api` prefix and the existing backend tests' paths get the prefix (mechanical) — done in the final plan task.
