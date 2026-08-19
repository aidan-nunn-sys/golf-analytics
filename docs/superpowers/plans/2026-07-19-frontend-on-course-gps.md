# On-Course GPS Frontend (Pillar 2 frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the UI for the already-merged Pillar 2 backend — course search/import, manual course entry, starting and playing a round with live GPS shot logging on a map, strokes entry, and a scorecard — extending the existing React SPA in place.

**Architecture:** New routes (`/courses`, `/courses/new`, `/courses/:id`, `/rounds`, `/rounds/:id`, `/rounds/:id/summary`) added to the existing `App.tsx` route tree inside the current `RequireAuth` + `Layout` shell. New API types/hooks follow the exact pattern already established in `api/types.ts` / `api/hooks.ts`. One new dependency: `react-leaflet` + `leaflet` for the live-round map.

**Tech Stack:** React 19.2, TypeScript ~6.0, Vite, Tailwind 3, TanStack Query 5, React Router 7, Vitest 4 + Testing Library. New: `react-leaflet` 5.x + `leaflet` 1.9.x (react-leaflet v5 requires React 19, which this app already has).

## Global Constraints

- Distances are canonically yards everywhere in the backend/API. The frontend never computes or sends a distance for GPS shots — the server computes `carry_yards` via `haversine_yards`. Client-side distance-to-pin display uses `frontend/src/units.ts`'s existing `yardsToDisplay`/`unitLabel` for unit conversion, same as the rest of the app.
- Per-user isolation is already enforced backend-side (every round/course/shot endpoint scopes or 404s on ownership) — the frontend does not need additional checks, just call the existing authenticated `apiGet`/`apiSend` client.
- No offline support — a dropped connection is a normal error/retry, no local queue.
- Every new screen/hook gets Vitest tests; `npx tsc -b --noEmit` must pass with no errors after every task.
- Commit messages: no AI co-author trailer (repo convention).
- Follow existing conventions exactly: `AsyncBoundary` for loading/error/empty states, mutation hooks that invalidate their own query key on success, an `actionError` component-state + dismissible banner pattern for surfacing mutation errors (see `routes/Bag.tsx`), Tailwind utility classes matching the existing palette (`bg-gray-50`, `text-gray-500`/`600`, `text-green-700`, `text-red-600`, `rounded border bg-white p-3`/`p-4`).
- The backend requires `start_lat/start_lng/end_lat/end_lng` on every `POST /rounds/{id}/shots` call — there is no club-only fallback. Without geolocation, only strokes-per-hole entry works.

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/geo.ts` (new) | Client-side haversine distance (yards), mirrors backend `app/stats/geo.py` |
| `frontend/src/geo.test.ts` (new) | Tests for `distanceYards` |
| `frontend/src/api/types.ts` (modify) | Add `Course`, `Hole`, `CourseSearchResult`, `ManualHoleInput`, `Round`, `RoundHole` types |
| `frontend/src/api/hooks.ts` (modify) | Add course/round query + mutation hooks |
| `frontend/src/api/hooks.test.tsx` (modify) | Tests for the new hooks |
| `frontend/src/routes/CourseSearch.tsx` (new) | `/courses` — Overpass search + import |
| `frontend/src/routes/CourseSearch.test.tsx` (new) | |
| `frontend/src/routes/CourseNew.tsx` (new) | `/courses/new` — manual course entry form |
| `frontend/src/routes/CourseNew.test.tsx` (new) | |
| `frontend/src/routes/CourseDetail.tsx` (new) | `/courses/:id` — hole list, start/resume round |
| `frontend/src/routes/CourseDetail.test.tsx` (new) | |
| `frontend/src/routes/RoundHistory.tsx` (new) | `/rounds` — past + in-progress rounds, nav entry point |
| `frontend/src/routes/RoundHistory.test.tsx` (new) | |
| `frontend/src/routes/LiveRound.tsx` (new) | `/rounds/:id` — strokes entry, hole nav, GPS map + shot logging |
| `frontend/src/routes/LiveRound.test.tsx` (new) | |
| `frontend/src/components/RoundMap.tsx` (new) | Leaflet map wrapper (green + live position markers), consumed only by `LiveRound` |
| `frontend/src/routes/RoundSummary.tsx` (new) | `/rounds/:id/summary` — scorecard |
| `frontend/src/routes/RoundSummary.test.tsx` (new) | |
| `frontend/src/App.tsx` (modify) | Add 6 new routes |
| `frontend/src/components/Layout.tsx` (modify) | Add "Rounds" nav link |
| `frontend/package.json` (modify) | Add `leaflet`, `react-leaflet`, `@types/leaflet` |

---

### Task 1: Leaflet dependency + client-side geo distance utility

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/geo.ts`
- Test: `frontend/src/geo.test.ts`

**Interfaces:**
- Produces: `distanceYards(lat1: number, lng1: number, lat2: number, lng2: number): number` — later tasks (RoundMap distance-to-pin display) import this from `../geo`.

- [ ] **Step 1: Install dependencies**

```bash
cd frontend
npm install leaflet react-leaflet
npm install -D @types/leaflet
```

Expected: `package.json` dependencies gain `"leaflet"` and `"react-leaflet"`; devDependencies gain `"@types/leaflet"`.

- [ ] **Step 2: Write the failing test**

```typescript
// frontend/src/geo.test.ts
import { describe, it, expect } from "vitest";
import { distanceYards } from "./geo";

describe("distanceYards", () => {
  it("returns 0 for the same point", () => {
    expect(distanceYards(36.5, -121.9, 36.5, -121.9)).toBe(0);
  });

  it("matches the backend's known-distance fixture", () => {
    // 0.001 degrees of latitude ~ 111 meters ~ 121.4 yards (mirrors backend/tests/test_geo.py)
    const d = distanceYards(36.5, -121.9, 36.501, -121.9);
    expect(d).toBeGreaterThan(115);
    expect(d).toBeLessThan(125);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/geo.test.ts`
Expected: FAIL — `Cannot find module './geo'` or similar.

- [ ] **Step 4: Write minimal implementation**

```typescript
// frontend/src/geo.ts
// Mirrors backend app/stats/geo.py haversine_yards() exactly (same formula/constant).
const EARTH_RADIUS_YARDS = 6_371_000 / 0.9144; // meters -> yards

export function distanceYards(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dphi = toRad(lat2 - lat1);
  const dlambda = toRad(lng2 - lng1);
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dlambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_YARDS * c;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/geo.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/geo.ts frontend/src/geo.test.ts
git commit -m "Add Leaflet dependency and client-side geo distance utility"
```

---

### Task 2: Course & Round API types and hooks

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/hooks.ts`
- Modify: `frontend/src/api/hooks.test.tsx`

**Interfaces:**
- Consumes: `apiGet`, `apiSend`, `ApiError` from `./client` (existing, unchanged).
- Produces (types, added to `api/types.ts`):
  - `ImportSource = "osm" | "manual"`
  - `RoundStatus = "in_progress" | "completed"`
  - `Hole { id: number; course_id: number; number: number; par: number | null; green_lat: number | null; green_lng: number | null; hazards: Record<string, unknown>[] | null }`
  - `Course { id: number; name: string; osm_id: string | null; import_source: ImportSource; location_lat: number | null; location_lng: number | null; imported_at: string; holes: Hole[] }`
  - `CourseSearchResult { osm_id: string; name: string; location_lat: number | null; location_lng: number | null; hole_count: number }`
  - `ManualHoleInput { number: number; par: number }`
  - `RoundHole { hole_number: number; par: number; strokes: number | null }`
  - `Round { id: number; course_id: number; date: string; status: RoundStatus; current_hole: number; holes: RoundHole[] }`
- Produces (hooks, added to `api/hooks.ts`), used by every screen task below:
  - `useCourseSearch(search: string)` — `UseQueryResult<CourseSearchResult[]>`, enabled only when `search.length > 0`.
  - `useCourse(id: number)` — `UseQueryResult<Course>`.
  - `useImportCourse()` — mutation, `mutate({ name, osm_id, location_lat, location_lng }: { name: string; osm_id: string; location_lat: number | null; location_lng: number | null })`, resolves `Course`.
  - `useCreateManualCourse()` — mutation, `mutate({ name, holes }: { name: string; holes: ManualHoleInput[] })`, resolves `Course`.
  - `useRounds()` — `UseQueryResult<Round[]>`.
  - `useRound(id: number)` — `UseQueryResult<Round>`.
  - `useCreateRound()` — mutation, `mutate({ course_id: number })`, resolves `Round`.
  - `useUpdateRound(id: number)` — mutation, `mutate({ current_hole, status }: { current_hole?: number; status?: RoundStatus })`, resolves `Round`.
  - `useUpdateRoundHole(id: number)` — mutation, `mutate({ number, strokes }: { number: number; strokes: number })`, resolves `Round`.
  - `useLogRoundShot(id: number)` — mutation, `mutate({ club_id, start_lat, start_lng, end_lat, end_lng, direction, accuracy, hole_number }: { club_id: number; start_lat: number; start_lng: number; end_lat: number; end_lng: number; direction?: "left" | "straight" | "right"; accuracy?: string; hole_number?: number })`, resolves `Shot` (existing `Shot` type — the backend's `ShotOut` already includes `round_id`/`hole_number`, so no new response type needed; if `Shot` doesn't yet have `round_id`/`hole_number` fields, add them: `round_id: number | null; hole_number: number | null`).

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/api/hooks.test.tsx` (existing imports/`wrapper` helper stay as-is, just add new imports and describe blocks):

```typescript
// add to the existing import from "./hooks":
import { useClubs, useCourseSearch, useCreateRound, useLogRoundShot } from "./hooks";

describe("useCourseSearch", () => {
  beforeEach(() => localStorage.clear());

  it("fetches courses with the search term in the query string", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve([]),
    }) as never;
    const { result } = renderHook(() => useCourseSearch("Pebble"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((globalThis.fetch as never as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
      "/api/courses?search=Pebble",
    );
  });

  it("does not fetch when the search term is empty", () => {
    globalThis.fetch = vi.fn();
    const { result } = renderHook(() => useCourseSearch(""), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("useCreateRound", () => {
  beforeEach(() => localStorage.clear());

  it("POSTs course_id to /rounds", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 201,
      json: () => Promise.resolve({ id: 5, course_id: 3, date: "2026-07-19", status: "in_progress", current_hole: 1, holes: [] }),
    }) as never;
    const { result } = renderHook(() => useCreateRound(), { wrapper });
    result.current.mutate({ course_id: 3 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, opts] = (globalThis.fetch as never as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/rounds");
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({ course_id: 3 });
  });
});

describe("useLogRoundShot", () => {
  beforeEach(() => localStorage.clear());

  it("POSTs shot coordinates to /rounds/{id}/shots", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 201,
      json: () => Promise.resolve({ id: 9, session_id: null, round_id: 5, hole_number: 1, club_id: 2, carry_yards: 150, total_yards: null, direction: "straight", source: "gps", created_at: "2026-07-19T00:00:00Z" }),
    }) as never;
    const { result } = renderHook(() => useLogRoundShot(5), { wrapper });
    result.current.mutate({ club_id: 2, start_lat: 1, start_lng: 2, end_lat: 3, end_lng: 4 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((globalThis.fetch as never as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("/api/rounds/5/shots");
  });
});
```

Note: keep the existing `useClubs` import/describe block already in the file — this only adds new imports and new `describe` blocks alongside it.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/api/hooks.test.tsx`
Expected: FAIL — `useCourseSearch`, `useCreateRound`, `useLogRoundShot` are not exported from `./hooks`.

- [ ] **Step 3: Add the types**

Append to `frontend/src/api/types.ts`:

```typescript
export type ImportSource = "osm" | "manual";
export type RoundStatus = "in_progress" | "completed";

export interface Hole {
  id: number;
  course_id: number;
  number: number;
  par: number | null;
  green_lat: number | null;
  green_lng: number | null;
  hazards: Record<string, unknown>[] | null;
}

export interface Course {
  id: number;
  name: string;
  osm_id: string | null;
  import_source: ImportSource;
  location_lat: number | null;
  location_lng: number | null;
  imported_at: string;
  holes: Hole[];
}

export interface CourseSearchResult {
  osm_id: string;
  name: string;
  location_lat: number | null;
  location_lng: number | null;
  hole_count: number;
}

export interface ManualHoleInput {
  number: number;
  par: number;
}

export interface RoundHole {
  hole_number: number;
  par: number;
  strokes: number | null;
}

export interface Round {
  id: number;
  course_id: number;
  date: string;
  status: RoundStatus;
  current_hole: number;
  holes: RoundHole[];
}
```

Also add `round_id` and `hole_number` to the existing `Shot` interface in the same file (the backend's `ShotOut` already returns them; the current frontend `Shot` type predates Pillar 2 and is missing them):

```typescript
export interface Shot {
  id: number;
  session_id: number | null;
  round_id: number | null;
  hole_number: number | null;
  club_id: number;
  carry_yards: number;
  total_yards: number | null;
  direction: Direction;
  source: string;
  created_at: string;
}
```

(This widens `session_id` to `number | null` too, matching the backend's `ShotOut.session_id: int | None` — round shots have no session.)

- [ ] **Step 4: Add the hooks**

Add to `frontend/src/api/hooks.ts`. First extend the `keys` object:

```typescript
  courseSearch: (search: string) => ["courseSearch", search] as const,
  course: (id: number) => ["course", id] as const,
  rounds: ["rounds"] as const,
  round: (id: number) => ["round", id] as const,
```

Then add imports at the top (extend the existing `import type` line and add the new type names):

```typescript
import type { Club, Course, CourseSearchResult, Dashboard, GapRow, ManualHoleInput, Round, RoundStatus, Session, Shot, ClubStats, User } from "./types";
```

Then add the queries and mutations:

```typescript
export const useCourseSearch = (search: string) =>
  useQuery({
    queryKey: keys.courseSearch(search),
    queryFn: () => apiGet<CourseSearchResult[]>(`/courses?search=${encodeURIComponent(search)}`),
    enabled: search.length > 0,
  });

export const useCourse = (id: number) =>
  useQuery({ queryKey: keys.course(id), queryFn: () => apiGet<Course>(`/courses/${id}`) });

export const useRounds = () => useQuery({ queryKey: keys.rounds, queryFn: () => apiGet<Round[]>("/rounds") });

export const useRound = (id: number) =>
  useQuery({ queryKey: keys.round(id), queryFn: () => apiGet<Round>(`/rounds/${id}`) });

export function useImportCourse() {
  return useMutation({
    mutationFn: (body: { name: string; osm_id: string; location_lat: number | null; location_lng: number | null }) =>
      apiSend<Course>("POST", "/courses", body),
  });
}

export function useCreateManualCourse() {
  return useMutation({
    mutationFn: (body: { name: string; holes: ManualHoleInput[] }) => apiSend<Course>("POST", "/courses", body),
  });
}

export function useCreateRound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { course_id: number }) => apiSend<Round>("POST", "/rounds", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.rounds }),
  });
}

export function useUpdateRound(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { current_hole?: number; status?: RoundStatus }) => apiSend<Round>("PATCH", `/rounds/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.round(id) });
      qc.invalidateQueries({ queryKey: keys.rounds });
    },
  });
}

export function useUpdateRoundHole(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ number, strokes }: { number: number; strokes: number }) =>
      apiSend<Round>("PATCH", `/rounds/${id}/holes/${number}`, { strokes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.round(id) }),
  });
}

export function useLogRoundShot(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      club_id: number;
      start_lat: number;
      start_lng: number;
      end_lat: number;
      end_lng: number;
      direction?: "left" | "straight" | "right";
      accuracy?: string;
      hole_number?: number;
    }) => apiSend<Shot>("POST", `/rounds/${id}/shots`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.round(id) }),
  });
}
```

Note: round shots deliberately do **not** invalidate `dashboard`/`gapping` query keys — round shots are excluded from stats/gapping per the deferred decision (spec `2026-07-11-on-course-gps-course-management-design.md`, decision log 2026-07-15). Do not call `useStatsInvalidation()` here.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/api/hooks.test.tsx`
Expected: PASS (all tests, including the pre-existing `useClubs` one)

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/hooks.ts frontend/src/api/hooks.test.tsx
git commit -m "Add Course and Round API types and TanStack Query hooks"
```

---

### Task 3: Course search screen

**Files:**
- Create: `frontend/src/routes/CourseSearch.tsx`
- Test: `frontend/src/routes/CourseSearch.test.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useCourseSearch`, `useImportCourse` (Task 2); `AsyncBoundary` (existing, `components/AsyncBoundary.tsx`); `CourseSearchResult` type (Task 2).
- Produces: route `/courses`, no exports consumed by later tasks except the route path itself (`CourseDetail`, `CourseNew`, `RoundHistory` link to `/courses/:id`, `/courses/new`, `/courses` respectively by URL string, not by importing this component).

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/routes/CourseSearch.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CourseSearch } from "./CourseSearch";
import { useCourseSearch, useImportCourse } from "../api/hooks";
import type { CourseSearchResult } from "../api/types";

vi.mock("../api/hooks", () => ({
  useCourseSearch: vi.fn(),
  useImportCourse: vi.fn(),
}));

const mockedUseCourseSearch = vi.mocked(useCourseSearch);
const mockedUseImportCourse = vi.mocked(useImportCourse);

const results: CourseSearchResult[] = [
  { osm_id: "way/1", name: "Pebble Beach Golf Links", location_lat: 36.5, location_lng: -121.9, hole_count: 18 },
];

function setup(data: CourseSearchResult[] = []) {
  const importCourse = { mutate: vi.fn() };
  mockedUseCourseSearch.mockReturnValue(
    { data, isLoading: false, error: null } as unknown as ReturnType<typeof useCourseSearch>,
  );
  mockedUseImportCourse.mockReturnValue(importCourse as unknown as ReturnType<typeof useImportCourse>);
  return { importCourse };
}

describe("CourseSearch", () => {
  beforeEach(() => {
    mockedUseCourseSearch.mockReset();
    mockedUseImportCourse.mockReset();
  });

  it("shows search results with hole count", () => {
    setup(results);
    render(<CourseSearch />, { wrapper: MemoryRouter });

    expect(screen.getByText("Pebble Beach Golf Links")).toBeInTheDocument();
    expect(screen.getByText("18 holes")).toBeInTheDocument();
  });

  it("imports a course on click", async () => {
    const { importCourse } = setup(results);
    const user = userEvent.setup();
    render(<CourseSearch />, { wrapper: MemoryRouter });

    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(importCourse.mutate).toHaveBeenCalledWith(
      { name: "Pebble Beach Golf Links", osm_id: "way/1", location_lat: 36.5, location_lng: -121.9 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("links to manual course entry", () => {
    setup([]);
    render(<CourseSearch />, { wrapper: MemoryRouter });

    expect(screen.getByRole("link", { name: "Add manually" })).toHaveAttribute("href", "/courses/new");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/routes/CourseSearch.test.tsx`
Expected: FAIL — `Cannot find module './CourseSearch'`

- [ ] **Step 3: Implement the screen**

```typescript
// frontend/src/routes/CourseSearch.tsx
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useCourseSearch, useImportCourse } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";

export function CourseSearch() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const { data: results, isLoading, error } = useCourseSearch(query);
  const importCourse = useImportCourse();
  const navigate = useNavigate();
  const [actionError, setActionError] = useState<string | null>(null);

  const onImport = (name: string, osm_id: string, location_lat: number | null, location_lng: number | null) => {
    importCourse.mutate(
      { name, osm_id, location_lat, location_lng },
      {
        onSuccess: (course) => navigate(`/courses/${course.id}`),
        onError: (err: unknown) =>
          setActionError(err instanceof Error ? err.message : "Something went wrong. Please try again."),
      },
    );
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Find a course</h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(input);
        }}
      >
        <input
          className="flex-1 rounded border px-3 py-1.5 text-sm"
          placeholder="Course name"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="rounded bg-green-600 px-3 py-1.5 text-sm text-white">
          Search
        </button>
      </form>
      <Link to="/courses/new" className="text-sm text-green-700">
        Add manually
      </Link>
      {actionError && (
        <div className="flex items-center justify-between rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          <span>{actionError}</span>
          <button aria-label="Dismiss error" onClick={() => setActionError(null)}>
            ×
          </button>
        </div>
      )}
      {query && (
        <AsyncBoundary loading={isLoading} error={error} isEmpty={!results?.length} emptyText="No courses found.">
          <ul className="space-y-2">
            {results?.map((r) => (
              <li key={r.osm_id} className="flex items-center justify-between rounded border bg-white p-3">
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-gray-500">{r.hole_count} holes</div>
                </div>
                <button
                  className="rounded bg-green-600 px-3 py-1.5 text-sm text-white"
                  onClick={() => onImport(r.name, r.osm_id, r.location_lat, r.location_lng)}
                >
                  Import
                </button>
              </li>
            ))}
          </ul>
        </AsyncBoundary>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the route**

In `frontend/src/App.tsx`, add the import and route:

```typescript
import { CourseSearch } from "./routes/CourseSearch";
```

Inside the `<Route element={<RequireAuth><Layout /></RequireAuth>}>` block, add:

```typescript
        <Route path="courses" element={<CourseSearch />} />
```

- [ ] **Step 5: Run test to verify it passes, then type-check**

Run: `cd frontend && npx vitest run src/routes/CourseSearch.test.tsx && npx tsc -b --noEmit`
Expected: PASS, no type errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/CourseSearch.tsx frontend/src/routes/CourseSearch.test.tsx frontend/src/App.tsx
git commit -m "Add course search screen with OSM import"
```

---

### Task 4: Add course manually screen

**Files:**
- Create: `frontend/src/routes/CourseNew.tsx`
- Test: `frontend/src/routes/CourseNew.test.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useCreateManualCourse` (Task 2); `ManualHoleInput` type (Task 2).
- Produces: route `/courses/new`.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/routes/CourseNew.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CourseNew } from "./CourseNew";
import { useCreateManualCourse } from "../api/hooks";

vi.mock("../api/hooks", () => ({ useCreateManualCourse: vi.fn() }));
const mockedUseCreateManualCourse = vi.mocked(useCreateManualCourse);

function setup() {
  const create = { mutate: vi.fn() };
  mockedUseCreateManualCourse.mockReturnValue(create as unknown as ReturnType<typeof useCreateManualCourse>);
  return { create };
}

describe("CourseNew", () => {
  beforeEach(() => mockedUseCreateManualCourse.mockReset());

  it("starts with one hole row and can add more", async () => {
    setup();
    const user = userEvent.setup();
    render(<CourseNew />, { wrapper: MemoryRouter });

    expect(screen.getAllByPlaceholderText("Par")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Add hole" }));
    expect(screen.getAllByPlaceholderText("Par")).toHaveLength(2);
  });

  it("blocks submit with no course name", async () => {
    const { create } = setup();
    const user = userEvent.setup();
    render(<CourseNew />, { wrapper: MemoryRouter });

    await user.type(screen.getAllByPlaceholderText("Par")[0], "4");
    await user.click(screen.getByRole("button", { name: "Create course" }));

    expect(screen.getByText("Course name is required.")).toBeInTheDocument();
    expect(create.mutate).not.toHaveBeenCalled();
  });

  it("submits name and holes when valid", async () => {
    const { create } = setup();
    const user = userEvent.setup();
    render(<CourseNew />, { wrapper: MemoryRouter });

    await user.type(screen.getByPlaceholderText("Course name"), "Backyard Nine");
    await user.type(screen.getAllByPlaceholderText("Par")[0], "4");
    await user.click(screen.getByRole("button", { name: "Create course" }));

    expect(create.mutate).toHaveBeenCalledWith(
      { name: "Backyard Nine", holes: [{ number: 1, par: 4 }] },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/routes/CourseNew.test.tsx`
Expected: FAIL — `Cannot find module './CourseNew'`

- [ ] **Step 3: Implement the screen**

```typescript
// frontend/src/routes/CourseNew.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateManualCourse } from "../api/hooks";

interface HoleRow {
  number: number;
  par: string;
}

export function CourseNew() {
  const [name, setName] = useState("");
  const [holes, setHoles] = useState<HoleRow[]>([{ number: 1, par: "" }]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const create = useCreateManualCourse();
  const navigate = useNavigate();

  const addHole = () => setHoles((h) => [...h, { number: h.length + 1, par: "" }]);
  const setPar = (index: number, par: string) =>
    setHoles((h) => h.map((row, i) => (i === index ? { ...row, par } : row)));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setValidationError("Course name is required.");
      return;
    }
    if (holes.length === 0 || holes.some((h) => !h.par || Number(h.par) <= 0)) {
      setValidationError("Every hole needs a par.");
      return;
    }
    setValidationError(null);
    create.mutate(
      { name, holes: holes.map((h) => ({ number: h.number, par: Number(h.par) })) },
      {
        onSuccess: (course) => navigate(`/courses/${course.id}`),
        onError: (err: unknown) =>
          setActionError(err instanceof Error ? err.message : "Something went wrong. Please try again."),
      },
    );
  };

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <h1 className="text-lg font-semibold">Add a course</h1>
      <input
        className="w-full rounded border px-3 py-1.5 text-sm"
        placeholder="Course name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="space-y-2">
        {holes.map((h, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-16 text-sm text-gray-500">Hole {h.number}</span>
            <input
              className="w-20 rounded border px-3 py-1.5 text-sm"
              placeholder="Par"
              inputMode="numeric"
              value={h.par}
              onChange={(e) => setPar(i, e.target.value)}
            />
          </div>
        ))}
      </div>
      <button type="button" onClick={addHole} className="text-sm text-green-700">
        Add hole
      </button>
      {validationError && <div className="text-sm text-red-600">{validationError}</div>}
      {actionError && (
        <div className="flex items-center justify-between rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          <span>{actionError}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setActionError(null)}>
            ×
          </button>
        </div>
      )}
      <button type="submit" className="rounded bg-green-600 px-3 py-1.5 text-sm text-white">
        Create course
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Add the route**

In `frontend/src/App.tsx`:

```typescript
import { CourseNew } from "./routes/CourseNew";
```

```typescript
        <Route path="courses/new" element={<CourseNew />} />
```

- [ ] **Step 5: Run test to verify it passes, then type-check**

Run: `cd frontend && npx vitest run src/routes/CourseNew.test.tsx && npx tsc -b --noEmit`
Expected: PASS, no type errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/CourseNew.tsx frontend/src/routes/CourseNew.test.tsx frontend/src/App.tsx
git commit -m "Add manual course entry screen"
```

---

### Task 5: Course detail screen — start/resume round

**Files:**
- Create: `frontend/src/routes/CourseDetail.tsx`
- Test: `frontend/src/routes/CourseDetail.test.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useCourse`, `useRounds`, `useCreateRound` (Task 2); `AsyncBoundary`.
- Produces: route `/courses/:id`.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/routes/CourseDetail.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CourseDetail } from "./CourseDetail";
import { useCourse, useRounds, useCreateRound } from "../api/hooks";
import type { Course, Round } from "../api/types";

vi.mock("../api/hooks", () => ({
  useCourse: vi.fn(),
  useRounds: vi.fn(),
  useCreateRound: vi.fn(),
}));

const mockedUseCourse = vi.mocked(useCourse);
const mockedUseRounds = vi.mocked(useRounds);
const mockedUseCreateRound = vi.mocked(useCreateRound);

const course: Course = {
  id: 7, name: "Pebble Beach", osm_id: "way/1", import_source: "osm",
  location_lat: 36.5, location_lng: -121.9, imported_at: "2026-07-19T00:00:00Z",
  holes: [{ id: 1, course_id: 7, number: 1, par: 4, green_lat: 36.51, green_lng: -121.91, hazards: null }],
};

function renderAt(rounds: Round[]) {
  const create = { mutate: vi.fn() };
  mockedUseCourse.mockReturnValue({ data: course, isLoading: false, error: null } as unknown as ReturnType<typeof useCourse>);
  mockedUseRounds.mockReturnValue({ data: rounds, isLoading: false, error: null } as unknown as ReturnType<typeof useRounds>);
  mockedUseCreateRound.mockReturnValue(create as unknown as ReturnType<typeof useCreateRound>);
  render(
    <MemoryRouter initialEntries={["/courses/7"]}>
      <Routes>
        <Route path="/courses/:id" element={<CourseDetail />} />
      </Routes>
    </MemoryRouter>,
  );
  return { create };
}

describe("CourseDetail", () => {
  beforeEach(() => {
    mockedUseCourse.mockReset();
    mockedUseRounds.mockReset();
    mockedUseCreateRound.mockReset();
  });

  it("shows hole list and par", () => {
    renderAt([]);
    expect(screen.getByText("Pebble Beach")).toBeInTheDocument();
    expect(screen.getByText("Hole 1")).toBeInTheDocument();
    expect(screen.getByText("Par 4")).toBeInTheDocument();
  });

  it("offers Start round when no in-progress round exists on this course", async () => {
    const { create } = renderAt([]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Start round" }));
    expect(create.mutate).toHaveBeenCalledWith({ course_id: 7 }, expect.objectContaining({ onSuccess: expect.any(Function) }));
  });

  it("offers Resume round when an in-progress round exists on this course", () => {
    renderAt([{ id: 9, course_id: 7, date: "2026-07-19", status: "in_progress", current_hole: 3, holes: [] }]);
    expect(screen.getByRole("link", { name: "Resume round" })).toHaveAttribute("href", "/rounds/9");
    expect(screen.queryByRole("button", { name: "Start round" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/routes/CourseDetail.test.tsx`
Expected: FAIL — `Cannot find module './CourseDetail'`

- [ ] **Step 3: Implement the screen**

```typescript
// frontend/src/routes/CourseDetail.tsx
import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useCourse, useRounds, useCreateRound } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";

export function CourseDetail() {
  const { id } = useParams();
  const courseId = Number(id);
  const { data: course, isLoading, error } = useCourse(courseId);
  const { data: rounds } = useRounds();
  const createRound = useCreateRound();
  const navigate = useNavigate();
  const [actionError, setActionError] = useState<string | null>(null);

  const activeRound = rounds?.find((r) => r.course_id === courseId && r.status === "in_progress");

  const onStart = () => {
    createRound.mutate(
      { course_id: courseId },
      {
        onSuccess: (round) => navigate(`/rounds/${round.id}`),
        onError: (err: unknown) =>
          setActionError(err instanceof Error ? err.message : "Something went wrong. Please try again."),
      },
    );
  };

  return (
    <AsyncBoundary loading={isLoading} error={error} isEmpty={!course}>
      {course && (
        <div className="space-y-4">
          <h1 className="text-lg font-semibold">{course.name}</h1>
          <ul className="space-y-1">
            {course.holes.map((h) => (
              <li key={h.id} className="flex justify-between rounded border bg-white p-2 text-sm">
                <span>Hole {h.number}</span>
                <span className="text-gray-500">{h.par == null ? "Par —" : `Par ${h.par}`}</span>
              </li>
            ))}
          </ul>
          {actionError && (
            <div className="flex items-center justify-between rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
              <span>{actionError}</span>
              <button aria-label="Dismiss error" onClick={() => setActionError(null)}>
                ×
              </button>
            </div>
          )}
          {activeRound ? (
            <Link
              to={`/rounds/${activeRound.id}`}
              className="inline-block rounded bg-green-600 px-3 py-1.5 text-sm text-white"
            >
              Resume round
            </Link>
          ) : (
            <button onClick={onStart} className="rounded bg-green-600 px-3 py-1.5 text-sm text-white">
              Start round
            </button>
          )}
        </div>
      )}
    </AsyncBoundary>
  );
}
```

- [ ] **Step 4: Add the route**

In `frontend/src/App.tsx`:

```typescript
import { CourseDetail } from "./routes/CourseDetail";
```

```typescript
        <Route path="courses/:id" element={<CourseDetail />} />
```

- [ ] **Step 5: Run test to verify it passes, then type-check**

Run: `cd frontend && npx vitest run src/routes/CourseDetail.test.tsx && npx tsc -b --noEmit`
Expected: PASS, no type errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/CourseDetail.tsx frontend/src/routes/CourseDetail.test.tsx frontend/src/App.tsx
git commit -m "Add course detail screen with start/resume round"
```

---

### Task 6: Round history screen

**Files:**
- Create: `frontend/src/routes/RoundHistory.tsx`
- Test: `frontend/src/routes/RoundHistory.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`

**Interfaces:**
- Consumes: `useRounds`, `useCourse` (Task 2, called per-row to get course names — there's no bulk course-list endpoint, only search-by-name, so this is a deliberate small N+1: TanStack Query caches/dedupes per `course_id`, and round counts are small in this self-hosted app).
- Produces: route `/rounds` (the new top-level nav destination).

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/routes/RoundHistory.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RoundHistory } from "./RoundHistory";
import { useRounds, useCourse } from "../api/hooks";
import type { Round, Course } from "../api/types";

vi.mock("../api/hooks", () => ({ useRounds: vi.fn(), useCourse: vi.fn() }));
const mockedUseRounds = vi.mocked(useRounds);
const mockedUseCourse = vi.mocked(useCourse);

const rounds: Round[] = [
  { id: 1, course_id: 7, date: "2026-07-10", status: "completed", current_hole: 18, holes: [] },
  { id: 2, course_id: 7, date: "2026-07-19", status: "in_progress", current_hole: 3, holes: [] },
];

function courseFor(id: number): Course {
  return { id, name: "Pebble Beach", osm_id: null, import_source: "osm", location_lat: null, location_lng: null, imported_at: "", holes: [] };
}

describe("RoundHistory", () => {
  beforeEach(() => {
    mockedUseRounds.mockReset();
    mockedUseCourse.mockReset();
  });

  it("surfaces the in-progress round before completed rounds", () => {
    mockedUseRounds.mockReturnValue({ data: rounds, isLoading: false, error: null } as unknown as ReturnType<typeof useRounds>);
    mockedUseCourse.mockImplementation((id: number) => ({ data: courseFor(id), isLoading: false, error: null }) as unknown as ReturnType<typeof useCourse>);
    render(<RoundHistory />, { wrapper: MemoryRouter });

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/rounds/2");
    expect(links[1]).toHaveAttribute("href", "/rounds/1/summary");
  });

  it("links a completed round to its summary and an in-progress round to live play", () => {
    mockedUseRounds.mockReturnValue({ data: rounds, isLoading: false, error: null } as unknown as ReturnType<typeof useRounds>);
    mockedUseCourse.mockImplementation((id: number) => ({ data: courseFor(id), isLoading: false, error: null }) as unknown as ReturnType<typeof useCourse>);
    render(<RoundHistory />, { wrapper: MemoryRouter });

    expect(screen.getByRole("link", { name: /In progress/ })).toHaveAttribute("href", "/rounds/2");
  });

  it("links to course search to start a new round", () => {
    mockedUseRounds.mockReturnValue({ data: [], isLoading: false, error: null } as unknown as ReturnType<typeof useRounds>);
    render(<RoundHistory />, { wrapper: MemoryRouter });

    expect(screen.getByRole("link", { name: "Start a round" })).toHaveAttribute("href", "/courses");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/routes/RoundHistory.test.tsx`
Expected: FAIL — `Cannot find module './RoundHistory'`

- [ ] **Step 3: Implement the screen**

```typescript
// frontend/src/routes/RoundHistory.tsx
import { Link } from "react-router-dom";
import { useRounds, useCourse } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";
import type { Round } from "../api/types";

function RoundRow({ round }: { round: Round }) {
  const { data: course } = useCourse(round.course_id);
  const isInProgress = round.status === "in_progress";
  return (
    <li>
      <Link
        to={isInProgress ? `/rounds/${round.id}` : `/rounds/${round.id}/summary`}
        className="flex items-center justify-between rounded border bg-white p-3 text-sm"
      >
        <span>
          {course?.name ?? "Course"} · {round.date}
        </span>
        <span className={isInProgress ? "font-medium text-green-700" : "text-gray-500"}>
          {isInProgress ? "In progress" : "Completed"}
        </span>
      </Link>
    </li>
  );
}

export function RoundHistory() {
  const { data: rounds, isLoading, error } = useRounds();
  const sorted = rounds
    ? [...rounds].sort((a, b) => (a.status === b.status ? 0 : a.status === "in_progress" ? -1 : 1))
    : rounds;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Rounds</h1>
        <Link to="/courses" className="rounded bg-green-600 px-3 py-1.5 text-sm text-white">
          Start a round
        </Link>
      </div>
      <AsyncBoundary loading={isLoading} error={error} isEmpty={!sorted?.length} emptyText="No rounds yet.">
        <ul className="space-y-2">{sorted?.map((r) => <RoundRow key={r.id} round={r} />)}</ul>
      </AsyncBoundary>
    </div>
  );
}
```

- [ ] **Step 4: Add the route and nav link**

In `frontend/src/App.tsx`:

```typescript
import { RoundHistory } from "./routes/RoundHistory";
```

```typescript
        <Route path="rounds" element={<RoundHistory />} />
```

In `frontend/src/components/Layout.tsx`, add to the `links` array (after `"/gapping"`, before `"/sessions"` — grouping the two history-style screens together mirrors the existing Sessions entry):

```typescript
  { to: "/rounds", label: "Rounds" },
```

- [ ] **Step 5: Run test to verify it passes, then type-check**

Run: `cd frontend && npx vitest run src/routes/RoundHistory.test.tsx && npx tsc -b --noEmit`
Expected: PASS, no type errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/RoundHistory.tsx frontend/src/routes/RoundHistory.test.tsx frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "Add round history screen and Rounds nav link"
```

---

### Task 7: Live round — strokes entry and hole navigation

**Files:**
- Create: `frontend/src/routes/LiveRound.tsx`
- Test: `frontend/src/routes/LiveRound.test.tsx`
- Modify: `frontend/src/App.tsx`

This task covers the score-keeping half of the Live Round screen — works for every course including manual (no-geo-data) ones. Task 8 layers GPS/map/shot-logging on top of the same file.

**Interfaces:**
- Consumes: `useRound`, `useUpdateRound`, `useUpdateRoundHole` (Task 2); `AsyncBoundary`.
- Produces: route `/rounds/:id`. Exports `LiveRound` — Task 8 modifies this same file in place (not a new file), so later tasks import nothing new from it.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/routes/LiveRound.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LiveRound } from "./LiveRound";
import { useRound, useUpdateRound, useUpdateRoundHole } from "../api/hooks";
import type { Round } from "../api/types";

vi.mock("../api/hooks", () => ({
  useRound: vi.fn(),
  useUpdateRound: vi.fn(),
  useUpdateRoundHole: vi.fn(),
}));

const mockedUseRound = vi.mocked(useRound);
const mockedUseUpdateRound = vi.mocked(useUpdateRound);
const mockedUseUpdateRoundHole = vi.mocked(useUpdateRoundHole);

const round: Round = {
  id: 5, course_id: 7, date: "2026-07-19", status: "in_progress", current_hole: 1,
  holes: [
    { hole_number: 1, par: 4, strokes: null },
    { hole_number: 2, par: 3, strokes: null },
  ],
};

function setup(r: Round = round) {
  const updateRound = { mutate: vi.fn() };
  const updateHole = { mutate: vi.fn() };
  mockedUseRound.mockReturnValue({ data: r, isLoading: false, error: null } as unknown as ReturnType<typeof useRound>);
  mockedUseUpdateRound.mockReturnValue(updateRound as unknown as ReturnType<typeof useUpdateRound>);
  mockedUseUpdateRoundHole.mockReturnValue(updateHole as unknown as ReturnType<typeof useUpdateRoundHole>);
  render(
    <MemoryRouter initialEntries={["/rounds/5"]}>
      <Routes>
        <Route path="/rounds/:id" element={<LiveRound />} />
      </Routes>
    </MemoryRouter>,
  );
  return { updateRound, updateHole };
}

describe("LiveRound", () => {
  beforeEach(() => {
    mockedUseRound.mockReset();
    mockedUseUpdateRound.mockReset();
    mockedUseUpdateRoundHole.mockReset();
  });

  it("shows the current hole's par", () => {
    setup();
    expect(screen.getByText("Hole 1")).toBeInTheDocument();
    expect(screen.getByText("Par 4")).toBeInTheDocument();
  });

  it("saves strokes for the current hole", async () => {
    const { updateHole } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Strokes"), "5");
    await user.click(screen.getByRole("button", { name: "Save strokes" }));
    expect(updateHole.mutate).toHaveBeenCalledWith({ number: 1, strokes: 5 });
  });

  it("advances to the next hole", async () => {
    const { updateRound } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Next hole" }));
    expect(updateRound.mutate).toHaveBeenCalledWith({ current_hole: 2 });
  });

  it("shows Finish round on the last hole and marks the round completed", async () => {
    const { updateRound } = setup({ ...round, current_hole: 2 });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Finish round" }));
    expect(updateRound.mutate).toHaveBeenCalledWith(
      { status: "completed" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/routes/LiveRound.test.tsx`
Expected: FAIL — `Cannot find module './LiveRound'`

- [ ] **Step 3: Implement the screen**

```typescript
// frontend/src/routes/LiveRound.tsx
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRound, useUpdateRound, useUpdateRoundHole } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";

export function LiveRound() {
  const { id } = useParams();
  const roundId = Number(id);
  const { data: round, isLoading, error } = useRound(roundId);
  const updateRound = useUpdateRound(roundId);
  const updateHole = useUpdateRoundHole(roundId);
  const navigate = useNavigate();
  const [strokesInput, setStrokesInput] = useState("");

  const holeNumbers = round ? [...round.holes.map((h) => h.hole_number)].sort((a, b) => a - b) : [];
  const currentHole = round?.holes.find((h) => h.hole_number === round.current_hole);
  const currentIndex = holeNumbers.indexOf(round?.current_hole ?? -1);
  const isLastHole = currentIndex === holeNumbers.length - 1;

  const onSaveStrokes = () => {
    if (!round || !strokesInput) return;
    updateHole.mutate({ number: round.current_hole, strokes: Number(strokesInput) });
    setStrokesInput("");
  };

  const onAdvance = () => {
    if (!round) return;
    if (isLastHole) {
      updateRound.mutate({ status: "completed" }, { onSuccess: () => navigate(`/rounds/${roundId}/summary`) });
    } else {
      updateRound.mutate({ current_hole: holeNumbers[currentIndex + 1] });
    }
  };

  return (
    <AsyncBoundary loading={isLoading} error={error} isEmpty={!round || !currentHole}>
      {round && currentHole && (
        <div className="space-y-4">
          <h1 className="text-lg font-semibold">Hole {currentHole.hole_number}</h1>
          <div className="text-sm text-gray-500">{currentHole.par == null ? "Par —" : `Par ${currentHole.par}`}</div>
          <div className="flex items-center gap-2">
            <input
              className="w-24 rounded border px-3 py-1.5 text-sm"
              placeholder="Strokes"
              inputMode="numeric"
              value={strokesInput}
              onChange={(e) => setStrokesInput(e.target.value)}
            />
            <button onClick={onSaveStrokes} className="rounded bg-green-600 px-3 py-1.5 text-sm text-white">
              Save strokes
            </button>
          </div>
          <button onClick={onAdvance} className="rounded border px-3 py-1.5 text-sm">
            {isLastHole ? "Finish round" : "Next hole"}
          </button>
        </div>
      )}
    </AsyncBoundary>
  );
}
```

- [ ] **Step 4: Add the route**

In `frontend/src/App.tsx`:

```typescript
import { LiveRound } from "./routes/LiveRound";
```

```typescript
        <Route path="rounds/:id" element={<LiveRound />} />
```

- [ ] **Step 5: Run test to verify it passes, then type-check**

Run: `cd frontend && npx vitest run src/routes/LiveRound.test.tsx && npx tsc -b --noEmit`
Expected: PASS, no type errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/LiveRound.tsx frontend/src/routes/LiveRound.test.tsx frontend/src/App.tsx
git commit -m "Add live round screen: strokes entry and hole navigation"
```

---

### Task 8: Live round — GPS position, map, and two-tap shot logging

**Files:**
- Modify: `frontend/src/routes/LiveRound.tsx` (Task 7's file)
- Modify: `frontend/src/routes/LiveRound.test.tsx` (Task 7's file, add new tests)
- Create: `frontend/src/components/RoundMap.tsx`
- Modify: `frontend/src/api/types.ts` — no change needed (`Course`/`Hole` already added in Task 2)

**Interfaces:**
- Consumes: `distanceYards` (Task 1); `useCourse` (Task 2, to get `import_source` and each hole's `green_lat`/`green_lng` — `RoundHole` from `useRound` does **not** carry geo data, only `hole_number`/`par`/`strokes`); `useLogRoundShot` (Task 2); `useClubs` (existing); `yardsToDisplay`, `unitLabel` (existing `units.ts`); `useAuth` (existing, for `unit_preference`).
- Produces: `RoundMap` component, `{ center: [number, number]; markerPosition: [number, number] | null }` props — used only by `LiveRound` in this file.

**Deviation from the design spec, confirmed against the actual `Hole` schema before implementing:** the spec (§4) says the map "falls back to tee if no green data" — there is no tee coordinate anywhere in the data model (`Hole` only has `green_lat`/`green_lng`, `par`, `number`, `hazards`; confirmed in `backend/app/schemas/course.py::HoleOut`). This task falls back to the **course's** `location_lat`/`location_lng` (the OSM course centroid, already returned by `GET /courses/{id}`) instead — the closest thing to a stable point that actually exists in the data. Flag this one-line spec correction to whoever reviews this task; it should be reflected back into the design spec's §4 bullet.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/routes/LiveRound.test.tsx`. First, mock `react-leaflet` (avoids real Leaflet DOM/canvas work in jsdom) and the two new hooks, and add geolocation stubbing:

```typescript
// add near the top of the file, alongside the existing vi.mock("../api/hooks", ...)
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
}));

// extend the existing vi.mock("../api/hooks", () => ({ ... })) factory to also include:
//   useCourse: vi.fn(),
//   useLogRoundShot: vi.fn(),
//   useClubs: vi.fn(),
```

Then extend the mocked-hook imports/setup and add these test cases:

```typescript
import { useRound, useUpdateRound, useUpdateRoundHole, useCourse, useLogRoundShot, useClubs } from "../api/hooks";
import type { Course, Club } from "../api/types";

const mockedUseCourse = vi.mocked(useCourse);
const mockedUseLogRoundShot = vi.mocked(useLogRoundShot);
const mockedUseClubs = vi.mocked(useClubs);

const osmCourse: Course = {
  id: 7, name: "Pebble Beach", osm_id: "way/1", import_source: "osm",
  location_lat: 36.5, location_lng: -121.9, imported_at: "",
  holes: [{ id: 1, course_id: 7, number: 1, par: 4, green_lat: 36.51, green_lng: -121.91, hazards: null }],
};
const manualCourse: Course = { ...osmCourse, import_source: "manual" };
const clubs: Club[] = [{ id: 2, label: "7 Iron", category: "iron", order_index: 0, loft: null, brand_model: null, is_active: true }];

function mockGeolocation(coords: { latitude: number; longitude: number; accuracy: number } | null) {
  const watchPosition = vi.fn((success: PositionCallback) => {
    if (coords) success({ coords, timestamp: Date.now() } as GeolocationPosition);
    return 1;
  });
  Object.defineProperty(globalThis.navigator, "geolocation", {
    configurable: true,
    value: { watchPosition, clearWatch: vi.fn() },
  });
  return watchPosition;
}

// extend setup() to also stub useCourse/useLogRoundShot/useClubs:
//   mockedUseCourse.mockReturnValue({ data: osmCourse, isLoading: false, error: null } as unknown as ReturnType<typeof useCourse>);
//   mockedUseLogRoundShot.mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<typeof useLogRoundShot>);
//   mockedUseClubs.mockReturnValue({ data: clubs, isLoading: false, error: null } as unknown as ReturnType<typeof useClubs>);

it("renders the map and distance-to-pin when geolocation is available", () => {
  mockGeolocation({ latitude: 36.505, longitude: -121.905, accuracy: 5 });
  setup();
  expect(screen.getByTestId("map")).toBeInTheDocument();
  expect(screen.getByText(/to green/)).toBeInTheDocument();
});

it("hides the map and shows a message when geolocation is denied", () => {
  mockGeolocation(null);
  const watchPosition = vi.fn((_success: PositionCallback, error?: PositionErrorCallback) => {
    error?.({ code: 1, message: "denied" } as GeolocationPositionError);
    return 1;
  });
  Object.defineProperty(globalThis.navigator, "geolocation", {
    configurable: true,
    value: { watchPosition, clearWatch: vi.fn() },
  });
  setup();
  expect(screen.getByText("Location unavailable")).toBeInTheDocument();
  expect(screen.queryByTestId("map")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Mark shot start" })).not.toBeInTheDocument();
});

it("hides the map for a manually-entered course even with geolocation available", () => {
  mockGeolocation({ latitude: 36.505, longitude: -121.905, accuracy: 5 });
  mockedUseCourse.mockReturnValue({ data: manualCourse, isLoading: false, error: null } as unknown as ReturnType<typeof useCourse>);
  setup();
  expect(screen.queryByTestId("map")).not.toBeInTheDocument();
});

it("logs a shot on the two-tap flow", async () => {
  mockGeolocation({ latitude: 36.505, longitude: -121.905, accuracy: 5 });
  const { logShot } = (() => {
    const logShot = { mutate: vi.fn() };
    mockedUseLogRoundShot.mockReturnValue(logShot as unknown as ReturnType<typeof useLogRoundShot>);
    return { logShot };
  })();
  setup();
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Mark shot start" }));
  await user.click(screen.getByRole("button", { name: "I'm at my ball" }));
  await user.selectOptions(screen.getByLabelText("Club"), "2");
  await user.click(screen.getByRole("button", { name: "Log shot" }));

  expect(logShot.mutate).toHaveBeenCalledWith({
    club_id: 2,
    start_lat: 36.505,
    start_lng: -121.905,
    end_lat: 36.505,
    end_lng: -121.905,
    direction: "straight",
    accuracy: "5",
    hole_number: 1,
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd frontend && npx vitest run src/routes/LiveRound.test.tsx`
Expected: FAIL — `react-leaflet` not installed as a real dep is fine (mocked), but `useCourse`/`useLogRoundShot`/`useClubs` aren't yet wired into `LiveRound.tsx`, and `RoundMap` doesn't exist — "Mark shot start" button, `data-testid="map"`, "Location unavailable" text all missing.

- [ ] **Step 3: Implement `RoundMap`**

```typescript
// frontend/src/components/RoundMap.tsx
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Leaflet's default marker icon paths break under bundlers (Vite included) —
// this is the standard fix: re-point the default icon at the bundled asset URLs.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export function RoundMap({
  center,
  markerPosition,
}: {
  center: [number, number];
  markerPosition: [number, number] | null;
}) {
  return (
    <MapContainer center={center} zoom={17} style={{ height: "16rem", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={center} />
      {markerPosition && <Marker position={markerPosition} />}
    </MapContainer>
  );
}
```

- [ ] **Step 4: Extend `LiveRound.tsx` with GPS tracking, map, and shot logging**

Replace the full contents of `frontend/src/routes/LiveRound.tsx`:

```typescript
// frontend/src/routes/LiveRound.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRound, useUpdateRound, useUpdateRoundHole, useCourse, useLogRoundShot, useClubs } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { RoundMap } from "../components/RoundMap";
import { distanceYards } from "../geo";
import { yardsToDisplay, unitLabel } from "../units";
import { useAuth } from "../auth/AuthContext";
import type { Direction } from "../api/types";

interface Position {
  lat: number;
  lng: number;
  accuracy: number;
}

function useLivePosition() {
  const [position, setPosition] = useState<Position | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setDenied(true);
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (p) => setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => setDenied(true),
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return { position, denied };
}

export function LiveRound() {
  const { id } = useParams();
  const roundId = Number(id);
  const { data: round, isLoading, error } = useRound(roundId);
  const { data: course } = useCourse(round?.course_id ?? -1);
  const { data: clubs } = useClubs();
  const updateRound = useUpdateRound(roundId);
  const updateHole = useUpdateRoundHole(roundId);
  const logShot = useLogRoundShot(roundId);
  const navigate = useNavigate();
  const { user } = useAuth();
  const unit = user?.unit_preference ?? "yards";

  const [strokesInput, setStrokesInput] = useState("");
  const [shotStart, setShotStart] = useState<Position | null>(null);
  const [confirmingShot, setConfirmingShot] = useState(false);
  const [clubId, setClubId] = useState<string>("");
  const [direction, setDirection] = useState<Direction>("straight");

  const { position, denied } = useLivePosition();

  const holeNumbers = round ? [...round.holes.map((h) => h.hole_number)].sort((a, b) => a - b) : [];
  const currentHole = round?.holes.find((h) => h.hole_number === round.current_hole);
  const currentIndex = holeNumbers.indexOf(round?.current_hole ?? -1);
  const isLastHole = currentIndex === holeNumbers.length - 1;
  const courseHole = course?.holes.find((h) => h.number === round?.current_hole);

  const showMap = course?.import_source !== "manual" && !denied && position;
  const green = courseHole?.green_lat != null && courseHole?.green_lng != null
    ? { lat: courseHole.green_lat, lng: courseHole.green_lng }
    : course
    ? { lat: course.location_lat, lng: course.location_lng }
    : null;
  const distanceToGreen =
    position && green?.lat != null && green?.lng != null
      ? distanceYards(position.lat, position.lng, green.lat, green.lng)
      : null;

  const onSaveStrokes = () => {
    if (!round || !strokesInput) return;
    updateHole.mutate({ number: round.current_hole, strokes: Number(strokesInput) });
    setStrokesInput("");
  };

  const onAdvance = () => {
    if (!round) return;
    if (isLastHole) {
      updateRound.mutate({ status: "completed" }, { onSuccess: () => navigate(`/rounds/${roundId}/summary`) });
    } else {
      updateRound.mutate({ current_hole: holeNumbers[currentIndex + 1] });
    }
  };

  const onLogShot = () => {
    if (!shotStart || !position || !clubId || !round) return;
    logShot.mutate({
      club_id: Number(clubId),
      start_lat: shotStart.lat,
      start_lng: shotStart.lng,
      end_lat: position.lat,
      end_lng: position.lng,
      direction,
      accuracy: String(position.accuracy),
      hole_number: round.current_hole,
    });
    setShotStart(null);
    setConfirmingShot(false);
    setClubId("");
    setDirection("straight");
  };

  return (
    <AsyncBoundary loading={isLoading} error={error} isEmpty={!round || !currentHole}>
      {round && currentHole && (
        <div className="space-y-4">
          <h1 className="text-lg font-semibold">Hole {currentHole.hole_number}</h1>
          <div className="text-sm text-gray-500">{currentHole.par == null ? "Par —" : `Par ${currentHole.par}`}</div>

          {denied || !navigator.geolocation ? (
            <div className="rounded border border-yellow-300 bg-yellow-50 p-2 text-sm text-yellow-800">
              Location unavailable — strokes-only entry for this round.
            </div>
          ) : null}

          {showMap && green?.lat != null && green?.lng != null && (
            <div className="space-y-2">
              <RoundMap center={[green.lat, green.lng]} markerPosition={position ? [position.lat, position.lng] : null} />
              {distanceToGreen != null && (
                <div className="text-sm text-gray-500">
                  {yardsToDisplay(distanceToGreen, unit)} {unitLabel(unit)} to green
                </div>
              )}
            </div>
          )}

          {!denied && navigator.geolocation && position && !confirmingShot && (
            <div className="flex gap-2">
              {!shotStart ? (
                <button
                  onClick={() => setShotStart(position)}
                  className="rounded border px-3 py-1.5 text-sm"
                >
                  Mark shot start
                </button>
              ) : (
                <button
                  onClick={() => setConfirmingShot(true)}
                  className="rounded bg-green-600 px-3 py-1.5 text-sm text-white"
                >
                  I'm at my ball
                </button>
              )}
            </div>
          )}

          {confirmingShot && (
            <div className="space-y-2 rounded border bg-white p-3">
              <label className="block text-sm">
                Club
                <select
                  aria-label="Club"
                  className="mt-1 block w-full rounded border px-2 py-1 text-sm"
                  value={clubId}
                  onChange={(e) => setClubId(e.target.value)}
                >
                  <option value="">Select a club</option>
                  {clubs?.filter((c) => c.is_active).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Direction
                <select
                  aria-label="Direction"
                  className="mt-1 block w-full rounded border px-2 py-1 text-sm"
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as Direction)}
                >
                  <option value="left">Left</option>
                  <option value="straight">Straight</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <button
                onClick={onLogShot}
                disabled={!clubId}
                className="rounded bg-green-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                Log shot
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              className="w-24 rounded border px-3 py-1.5 text-sm"
              placeholder="Strokes"
              inputMode="numeric"
              value={strokesInput}
              onChange={(e) => setStrokesInput(e.target.value)}
            />
            <button onClick={onSaveStrokes} className="rounded bg-green-600 px-3 py-1.5 text-sm text-white">
              Save strokes
            </button>
          </div>
          <button onClick={onAdvance} className="rounded border px-3 py-1.5 text-sm">
            {isLastHole ? "Finish round" : "Next hole"}
          </button>
        </div>
      )}
    </AsyncBoundary>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/routes/LiveRound.test.tsx`
Expected: PASS (all tests from Task 7 and this task)

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors (if `navigator.geolocation`/`GeolocationPosition` types are missing, they come from the standard `lib.dom.d.ts` already included by Vite's default `tsconfig` — no extra `@types` package needed)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routes/LiveRound.tsx frontend/src/routes/LiveRound.test.tsx frontend/src/components/RoundMap.tsx
git commit -m "Add GPS live position, map, and two-tap shot logging to live round"
```

---

### Task 9: Scorecard summary screen

**Files:**
- Create: `frontend/src/routes/RoundSummary.tsx`
- Test: `frontend/src/routes/RoundSummary.test.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useRound`, `useCourse` (Task 2); `AsyncBoundary`.
- Produces: route `/rounds/:id/summary`.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/routes/RoundSummary.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RoundSummary } from "./RoundSummary";
import { useRound, useCourse } from "../api/hooks";
import type { Round, Course } from "../api/types";

vi.mock("../api/hooks", () => ({ useRound: vi.fn(), useCourse: vi.fn() }));
const mockedUseRound = vi.mocked(useRound);
const mockedUseCourse = vi.mocked(useCourse);

const round: Round = {
  id: 5, course_id: 7, date: "2026-07-19", status: "completed", current_hole: 2,
  holes: [
    { hole_number: 1, par: 4, strokes: 5 },
    { hole_number: 2, par: 3, strokes: 3 },
  ],
};
const course: Course = { id: 7, name: "Pebble Beach", osm_id: null, import_source: "osm", location_lat: null, location_lng: null, imported_at: "", holes: [] };

function setup() {
  mockedUseRound.mockReturnValue({ data: round, isLoading: false, error: null } as unknown as ReturnType<typeof useRound>);
  mockedUseCourse.mockReturnValue({ data: course, isLoading: false, error: null } as unknown as ReturnType<typeof useCourse>);
  render(
    <MemoryRouter initialEntries={["/rounds/5/summary"]}>
      <Routes>
        <Route path="/rounds/:id/summary" element={<RoundSummary />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RoundSummary", () => {
  beforeEach(() => {
    mockedUseRound.mockReset();
    mockedUseCourse.mockReset();
  });

  it("shows strokes per hole and the running total", () => {
    setup();
    expect(screen.getByText("Pebble Beach")).toBeInTheDocument();
    expect(screen.getByText("Total: 8")).toBeInTheDocument();
  });

  it("shows the result vs. par", () => {
    setup();
    // 8 strokes vs. 7 par = +1
    expect(screen.getByText("+1")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/routes/RoundSummary.test.tsx`
Expected: FAIL — `Cannot find module './RoundSummary'`

- [ ] **Step 3: Implement the screen**

```typescript
// frontend/src/routes/RoundSummary.tsx
import { useParams } from "react-router-dom";
import { useRound, useCourse } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";

export function RoundSummary() {
  const { id } = useParams();
  const roundId = Number(id);
  const { data: round, isLoading, error } = useRound(roundId);
  const { data: course } = useCourse(round?.course_id ?? -1);

  const totalStrokes = round?.holes.reduce((sum, h) => sum + (h.strokes ?? 0), 0) ?? 0;
  const totalPar = round?.holes.reduce((sum, h) => sum + h.par, 0) ?? 0;
  const vsPar = totalStrokes - totalPar;
  const vsParLabel = vsPar === 0 ? "E" : vsPar > 0 ? `+${vsPar}` : `${vsPar}`;

  return (
    <AsyncBoundary loading={isLoading} error={error} isEmpty={!round}>
      {round && (
        <div className="space-y-4">
          <h1 className="text-lg font-semibold">{course?.name ?? "Round"}</h1>
          <div className="text-sm text-gray-500">{round.date}</div>
          <ul className="space-y-1">
            {round.holes.map((h) => (
              <li key={h.hole_number} className="flex justify-between rounded border bg-white p-2 text-sm">
                <span>Hole {h.hole_number} (Par {h.par})</span>
                <span>{h.strokes ?? "—"}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between rounded border bg-white p-3">
            <span className="font-medium">Total: {totalStrokes}</span>
            <span className="font-medium">{vsParLabel}</span>
          </div>
        </div>
      )}
    </AsyncBoundary>
  );
}
```

- [ ] **Step 4: Add the route**

In `frontend/src/App.tsx`:

```typescript
import { RoundSummary } from "./routes/RoundSummary";
```

```typescript
        <Route path="rounds/:id/summary" element={<RoundSummary />} />
```

- [ ] **Step 5: Run test to verify it passes, then type-check**

Run: `cd frontend && npx vitest run src/routes/RoundSummary.test.tsx && npx tsc -b --noEmit`
Expected: PASS, no type errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/RoundSummary.tsx frontend/src/routes/RoundSummary.test.tsx frontend/src/App.tsx
git commit -m "Add scorecard summary screen"
```

---

### Task 10: Final integration check

**Files:** none new — verification + docs only.
- `docs/superpowers/specs/2026-07-19-frontend-on-course-gps-design.md` (modify — decision log entry + §4 tee/green-fallback correction)
- `docs/superpowers/plans/2026-07-19-frontend-on-course-gps.md` (this file, modify — STATUS banner)
- `README.md` (modify — roadmap line, if this slice completes the on-course GPS pillar's UI)

- [ ] **Step 1: Full test suite**

```bash
cd frontend
npx vitest run
npx tsc -b --noEmit
```

Expected: all tests green (every existing Pillar 1 test plus every test added in Tasks 1–9), no type errors.

- [ ] **Step 2: Production build check**

```bash
cd frontend
npm run build
```

Expected: build succeeds — this is the closest thing to an end-to-end smoke test without an e2e framework; it catches import errors, unresolved modules (e.g. a missing `leaflet/dist/leaflet.css` resolution), and type errors `tsc -b` alone might not (it also runs `vite build`'s own transform pass).

- [ ] **Step 3: Manual smoke test against the real backend**

```bash
# terminal 1
cd backend && .venv/bin/uvicorn app.main:app --reload
# terminal 2
cd frontend && npm run dev
```

Open `http://localhost:5173`, log in, and walk the golden path once:
1. Rounds nav link → Round history (empty state or existing rounds).
2. "Start a round" → Course search → search a real course name → Import (requires network access to the public Overpass API — if unavailable, use "Add manually" instead with 2-3 holes).
3. Course detail → "Start round" → lands on Live round.
4. Confirm the "Location unavailable" banner appears if the browser denies/lacks geolocation (expected in most headless/dev setups without HTTPS — geolocation requires a secure context, so `http://localhost` should still work in Chrome for local dev, but confirm either way and record which path was actually exercised).
5. Enter strokes, click "Next hole" through to the last hole, click "Finish round".
6. Confirm the scorecard summary shows correct totals and vs-par.

Record in the task report which of these were verified live vs. which were only covered by the automated tests (e.g., GPS shot logging requires either a real device with location services or manually granting a fake location in Chrome DevTools — call out explicitly if this wasn't exercised against a live browser).

- [ ] **Step 4: Correct the design spec**

In `docs/superpowers/specs/2026-07-19-frontend-on-course-gps-design.md`, fix §4's "falls back to tee if no green data" line — there is no tee coordinate in the data model. Replace with:

```markdown
- **Map:** react-leaflet centered on the current hole's green (falls back to
  the course's `location_lat`/`location_lng` if the hole has no green data —
  there's no tee coordinate in the data model to fall back to, corrected
  during implementation). If `course.import_source === "manual"` (no geo
  data at all), the map is omitted entirely — strokes-only entry.
```

Append a decision-log entry:

```markdown
- **2026-07-19** — Corrected §4: the "falls back to tee" map-centering
  behavior described in the original design was never buildable — `Hole`
  has no tee coordinate field, only `green_lat`/`green_lng` (confirmed
  against `backend/app/schemas/course.py::HoleOut` during Task 8). Falls
  back to the course's `location_lat`/`location_lng` instead.
```

- [ ] **Step 5: Add a STATUS banner to the plan**

Add to the top of `docs/superpowers/plans/2026-07-19-frontend-on-course-gps.md`, immediately below the H1 title:

```markdown
> **✅ STATUS (2026-07-19):** Tasks 1–9 built and verified — course search/import,
> manual course entry, course detail with resume-round nudge, round history,
> live round (strokes + GPS shot logging + map), and scorecard summary. All
> frontend tests green, `tsc -b --noEmit` clean, production build succeeds.
> See Task 10's report for what was verified live vs. only by automated tests.
```

- [ ] **Step 6: Update the README roadmap**

In `README.md`, move "on-course GPS + OpenStreetMap" out of the "Roadmap" line under `## Status` and add a line to the `v1 web client` sentence noting round play is covered, e.g.:

```markdown
v1 web client: React/Vite SPA covering login, club bag, sessions, shot logging,
stats dashboards, and on-course GPS rounds (course search/import, live GPS shot
logging, scorecards) — served single-origin with the API via Docker.

Roadmap: launch-monitor import; GPS-measured range shots; scores/handicap/round
stats (Pillar 3); learning profile (Pillar 4).
```

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-07-19-frontend-on-course-gps-design.md \
        docs/superpowers/plans/2026-07-19-frontend-on-course-gps.md \
        README.md
git commit -m "Verify Pillar 2 frontend integration, correct spec, update docs"
```
