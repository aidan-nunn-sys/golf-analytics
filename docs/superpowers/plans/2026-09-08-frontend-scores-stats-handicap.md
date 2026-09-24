# Pillar 3 Frontend — Scores, Round Stats & Handicap — Implementation Plan

> **Implementation status (2026-09-24): built and automatically verified.**
> Tee setup, live stat entry, summary editing, past-round entry, Handicap, dashboard,
> and navigation are implemented. Frontend: 158 tests pass; production build
> (including TypeScript) passes; lint exits successfully with four existing warnings
> in AuthContext and TeeSetup. Full backend suite passes outside the sandbox;
> the sandboxed TestClient event loop stalled. No live browser/Docker smoke was
> performed in this pass, so Task 10's manual walkthrough remains unchecked.

### Final implementation notes — 2026-09-24

- Tasks 1–6 were substantially present when this pass began. Existing uncommitted
  course-search geocoding/error handling and scorecard validation changes were
  preserved and verified by the backend and frontend suites.
- Tasks 7–9 are implemented: `/rounds/new`, `/handicap`, Index on the dashboard,
  navigation, backlog links, and an explicit abandoned-round label.
- RoundEntry reads full course data from the existing course-library response;
  it does not make a redundant `useCourse` request. Course creation/import now
  invalidates that library. Course or nine/round-length changes reset hole drafts;
  course changes also clear the selected tee. Date is explicit, at least one score
  is required, unknown optional stats are omitted, and save failures retain inputs.
- Handicap renders the full scoring record supplied by the API, newest first,
  including exclusions. Counting flags come from the server. The sparkline uses
  chronological eligible rounds with an established Index; plus handicaps use
  golf notation. It does not recalculate handicap rules in the browser.
- The existing September 22 scoring-trends component remains the dashboard's
  score comparison: separate 9/18-hole samples and completeness checks are kept,
  rather than adding the older plan's unfiltered score sparkline.
- A shared HandicapOverview keeps dashboard and Handicap copy/formatting aligned.
- The historical task checklists below are retained as the original plan; this
  status and the final notes describe the verified implementation.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the UI for the already-complete Pillar 3 backend — tee/rating setup, scorecard stat entry, fast backlog entry, and a Handicap Index screen — extending the existing React SPA in place.

**Architecture:** New routes (`/courses/:id/tees`, `/rounds/new`, `/handicap`) added to the existing `App.tsx` tree inside the current `RequireAuth` + `Layout` shell. Existing `CourseDetail`, `LiveRound`, `RoundSummary`, `RoundHistory`, and `Dashboard` screens are extended, not replaced. API types/hooks follow `api/types.ts` / `api/hooks.ts`. Two small backend seams this UI cannot function without are in this plan: `HoleOut.stroke_index` (so the stroke-index grid can round-trip) and `GET /courses/library` (so backlog entry can pick an already-imported course — today's `GET /courses?search=` only hits Overpass). No new frontend dependencies.

**Tech Stack:** React 19.2, TypeScript ~6.0, Vite, Tailwind 3, TanStack Query 5, React Router 7, Vitest 4 + Testing Library. No charting library — Index/score trends are an inline SVG polyline.

**Spec:** `docs/superpowers/specs/2026-09-03-scores-stats-handicap-design.md` §5, §6, §8, §9.

## Global Constraints

- Distances remain canonically yards in the API. This slice does not send or convert shot distances; tee `yardage` is a whole-yard scorecard figure displayed as entered.
- **Stats and the Index are derived on the server.** The frontend never computes GIR, scrambling, differentials, or the Index. It displays `GET /rounds/{id}/stats`, `GET /stats/handicap`, and `GET /stats/rounds`.
- The Index is unofficial. Every handicap surface (the Handicap screen, and the Dashboard Index) must include this sentence verbatim: `This Index is for personal use and is not an official World Handicap System record.`
- Per-user isolation is already enforced backend-side. Call the existing authenticated `apiGet`/`apiSend` client.
- Follow existing conventions: `AsyncBoundary` for loading/error/empty; mutation hooks that invalidate their own query keys on success; dismissible `actionError` banner (see `routes/Bag.tsx`); Tailwind palette (`bg-gray-50`, `text-gray-500`/`600`, `text-green-700`, `text-red-600`, `rounded border bg-white p-3`).
- Every new screen/hook gets Vitest tests; `npx tsc -b --noEmit` must pass after every task.
- Commit messages: the change only. No `Co-authored-by` / `Made-with` / `Generated-by` trailers, session links, agent IDs, or mentions of Cursor, Codex, Claude, or any other agent or model. Same rule for branch names, tags, and PR titles/bodies.
- Par 3s have no fairway: do not render a fairway control when `par === 3`; send `fairway_hit: null` (or omit it).
- Missing hole stats stay `null` — never send `0` / `false` as a stand-in for "not recorded".
- A backlog round **must** send an explicit `date` and `status: "completed"`. Do not rely on the server defaulting the date.
- `apiSend` today only types `POST | PATCH | DELETE`. Ratings and stroke-index are PUT. Extend the method union; do not add a second helper.
- Do not add a charting library. Do not add an admin-user UI. Do not import scoring history from CSV. Do not post scores to a handicap authority.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/app/schemas/course.py` (modify) | Add `stroke_index` to `HoleOut` |
| `backend/app/routers/courses.py` (modify) | Add `GET /courses/library` **above** `GET /courses/{id}` |
| `backend/tests/test_courses.py` (modify) | Tests for both seams |
| `frontend/src/api/client.ts` (modify) | Allow `PUT` on `apiSend` |
| `frontend/src/api/types.ts` (modify) | Tee, rating, handicap, round-stat, extended Round/Hole types |
| `frontend/src/testFixtures.ts` (new) | `roundFixture` / `holeFixture` / `roundHoleFixture` so existing tests compile |
| `frontend/src/api/hooks.ts` (modify) | Tee/handicap/library/round-stat hooks; extend create-round and patch-hole |
| `frontend/src/api/hooks.test.tsx` (modify) | Tests for the new hooks |
| `frontend/src/strokeIndex.ts` (new) | Client-side permutation check (spec §5) |
| `frontend/src/strokeIndex.test.ts` (new) | |
| `frontend/src/routes/TeeSetup.tsx` (new) | `/courses/:id/tees` |
| `frontend/src/routes/TeeSetup.test.tsx` (new) | |
| `frontend/src/routes/CourseDetail.tsx` (modify) | Tee picker, 9/18, links to tee setup and backlog |
| `frontend/src/routes/CourseDetail.test.tsx` (modify) | |
| `frontend/src/routes/LiveRound.tsx` (modify) | Optional putts / fairway / penalties on the current hole |
| `frontend/src/routes/LiveRound.test.tsx` (modify) | |
| `frontend/src/routes/RoundSummary.tsx` (modify) | Derived stat strip + editable hole detail |
| `frontend/src/routes/RoundSummary.test.tsx` (modify) | |
| `frontend/src/routes/RoundEntry.tsx` (new) | `/rounds/new` — fast backlog grid |
| `frontend/src/routes/RoundEntry.test.tsx` (new) | |
| `frontend/src/routes/Handicap.tsx` (new) | `/handicap` |
| `frontend/src/routes/Handicap.test.tsx` (new) | |
| `frontend/src/components/Sparkline.tsx` (new) | SVG polyline, used by Handicap and Dashboard |
| `frontend/src/components/Sparkline.test.tsx` (new) | |
| `frontend/src/routes/Dashboard.tsx` (modify) | Index + recent-form line |
| `frontend/src/routes/Dashboard.test.tsx` (new) | |
| `frontend/src/routes/RoundHistory.tsx` (modify) | Abandoned → summary; link to backlog |
| `frontend/src/routes/RoundHistory.test.tsx` (modify) | |
| `frontend/src/App.tsx` (modify) | Three new routes |
| `frontend/src/components/Layout.tsx` (modify) | Handicap nav link |

Existing tests that construct `Round`, `RoundHole`, or `Hole` objects must be updated in Task 2 via `testFixtures.ts` so `tsc` stays green. Do not leave partial objects around.

---

### Task 1: Backend seams — `stroke_index` on `HoleOut` and a local course library

**Files:**
- Modify: `backend/app/schemas/course.py`
- Modify: `backend/app/routers/courses.py`
- Modify: `backend/tests/test_courses.py`

**Interfaces:**
- Consumes: existing `Hole.stroke_index`, `Course` rows, `_course_out`.
- Produces: `HoleOut.stroke_index: int | None`; `GET /api/courses/library` → `list[CourseOut]` (shared library, newest-name order is fine — sort by `name`). Later tasks read stroke indexes from `useCourse` and pick backlog courses from `useCourseLibrary`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_courses.py`:

```python
def test_hole_out_includes_stroke_index(client, auth_headers):
    created = client.post(
        "/api/courses",
        json={"name": "SI Links", "holes": [{"number": 1, "par": 4}, {"number": 2, "par": 3}]},
        headers=auth_headers,
    ).json()
    assert created["holes"][0]["stroke_index"] is None

    put = client.put(
        f"/api/courses/{created['id']}/stroke-index",
        json={"stroke_indexes": [2, 1]},
        headers=auth_headers,
    )
    assert put.status_code == 200

    fetched = client.get(f"/api/courses/{created['id']}", headers=auth_headers).json()
    assert [h["stroke_index"] for h in fetched["holes"]] == [2, 1]


def test_course_library_lists_imported_courses(client, auth_headers):
    empty = client.get("/api/courses/library", headers=auth_headers)
    assert empty.status_code == 200
    assert empty.json() == []

    client.post(
        "/api/courses",
        json={"name": "Backyard Links", "holes": [{"number": 1, "par": 3}]},
        headers=auth_headers,
    )
    listed = client.get("/api/courses/library", headers=auth_headers)
    assert listed.status_code == 200
    names = [c["name"] for c in listed.json()]
    assert "Backyard Links" in names
    assert "holes" in listed.json()[0]


def test_course_library_requires_auth(client):
    assert client.get("/api/courses/library").status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_courses.py::test_hole_out_includes_stroke_index tests/test_courses.py::test_course_library_lists_imported_courses tests/test_courses.py::test_course_library_requires_auth -q`

Expected: FAIL — `stroke_index` missing from JSON, and `/api/courses/library` is 422 (path param) or 404.

- [ ] **Step 3: Implement**

In `backend/app/schemas/course.py`, add `stroke_index` to `HoleOut` immediately after `hazards`:

```python
    hazards: list[dict] | None
    stroke_index: int | None = None
```

In `backend/app/routers/courses.py`, add this handler **above** `get_course` so `/library` is never parsed as an id:

```python
@router.get("/library", response_model=list[CourseOut])
def list_library(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CourseOut]:
    courses = db.scalars(select(Course).order_by(Course.name)).all()
    return [_course_out(db, c) for c in courses]
```

`_course_out` already builds `HoleOut.model_validate(h)`; once the field exists on the schema it serializes automatically. Courses are shared across users (Pillar 2 decision) — do not filter by owner.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_courses.py -q`

Expected: PASS, including the three new tests.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/course.py backend/app/routers/courses.py backend/tests/test_courses.py
git commit -m "Expose stroke index on holes and list imported courses"
```

---

### Task 2: Client PUT, types, fixtures, and hooks

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/types.ts`
- Create: `frontend/src/testFixtures.ts`
- Modify: `frontend/src/api/hooks.ts`
- Modify: `frontend/src/api/hooks.test.tsx`
- Modify: `frontend/src/routes/CourseDetail.test.tsx`
- Modify: `frontend/src/routes/LiveRound.test.tsx`
- Modify: `frontend/src/routes/RoundSummary.test.tsx`
- Modify: `frontend/src/routes/RoundHistory.test.tsx`

**Interfaces:**
- Consumes: Task 1 endpoints; existing `apiGet`/`apiSend`.
- Produces: types and hooks listed below. Later tasks import only from `../api/types` and `../api/hooks`.

Types to add/replace in `frontend/src/api/types.ts` (replace the existing `RoundStatus`, `Hole`, `RoundHole`, `Round` — do not leave a second copy):

```typescript
export type RoundStatus = "in_progress" | "completed" | "abandoned";
export type Nine = "front" | "back";
export type RatingScope = "18" | "front9" | "back9";

export interface Hole {
  id: number;
  course_id: number;
  number: number;
  par: number | null;
  green_lat: number | null;
  green_lng: number | null;
  hazards: Record<string, unknown>[] | null;
  stroke_index: number | null;
}

export interface RoundHole {
  hole_number: number;
  par: number;
  strokes: number | null;
  putts: number | null;
  fairway_hit: boolean | null;
  penalties: number;
}

export interface RoundHoleInput {
  number: number;
  strokes?: number | null;
  putts?: number | null;
  fairway_hit?: boolean | null;
  penalties?: number;
}

export interface Round {
  id: number;
  course_id: number;
  date: string;
  status: RoundStatus;
  current_hole: number;
  tee_set_id: number | null;
  hole_count: number;
  nine: Nine | null;
  course_rating: number | null;
  slope_rating: number | null;
  course_par: number | null;
  holes: RoundHole[];
}

export interface RoundCreate {
  course_id: number;
  date?: string;
  tee_set_id?: number | null;
  hole_count?: 9 | 18;
  nine?: Nine;
  status?: RoundStatus;
  holes?: RoundHoleInput[];
}

export interface TeeRating {
  id: number;
  scope: RatingScope;
  course_rating: number;
  slope_rating: number;
  par: number;
}

export interface TeeSet {
  id: number;
  course_id: number;
  name: string;
  yardage: number | null;
  ratings: TeeRating[];
}

export interface RoundStats {
  score: number;
  to_par: number;
  fairways_hit: number;
  fairways_possible: number;
  fairway_pct: number | null;
  gir: number;
  gir_pct: number | null;
  putts: number;
  putts_per_gir: number | null;
  one_putts: number;
  three_putts: number;
  scrambling_pct: number | null;
  penalties: number;
  differential: number | null;
  counts_toward_index: boolean;
  reason: string | null;
}

export interface DifferentialRow {
  round_id: number;
  date: string;
  differential: number | null;
  counts_toward_index: boolean;
  reason: string | null;
  is_counting: boolean;
  index_after: number | null;
}

export interface Handicap {
  index: number | null;
  low_index: number | null;
  cap_applied: "soft" | "hard" | null;
  cap_adjustment: number | null;
  rounds_needed: number;
  differentials: DifferentialRow[];
}

export interface RoundTrend {
  rounds: RoundStats[];
  averages: { score: number | null; putts: number | null; gir_pct: number | null; fairway_pct: number | null };
}
```

Keep the existing `User`, `Club`, `Session`, `Shot`, `Course`, etc. `Course.holes` now uses the extended `Hole`.

- [ ] **Step 1: Write the failing hook tests**

Append to `frontend/src/api/hooks.test.tsx` (keep existing imports/`wrapper`; add the new hook names to the import from `./hooks`):

```typescript
import {
  useClubs,
  useCourseSearch,
  useCreateRound,
  useLogRoundShot,
  useTees,
  useCreateTee,
  useUpsertTeeRating,
  useSetStrokeIndex,
  useCourseLibrary,
  useHandicap,
  useRoundStats,
  useRoundTrends,
} from "./hooks";
```

```typescript
describe("useTees", () => {
  beforeEach(() => localStorage.clear());
  it("fetches tees for a course", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve([{ id: 1, course_id: 7, name: "Blue", yardage: 6200, ratings: [] }]),
    }) as never;
    const { result } = renderHook(() => useTees(7), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((globalThis.fetch as never as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("/api/courses/7/tees");
  });
});

describe("useUpsertTeeRating", () => {
  beforeEach(() => localStorage.clear());
  it("PUTs a rating for a scope", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ id: 3, scope: "18", course_rating: 71.2, slope_rating: 132, par: 72 }),
    }) as never;
    const { result } = renderHook(() => useUpsertTeeRating(), { wrapper });
    result.current.mutate({ teeId: 4, scope: "18", body: { course_rating: 71.2, slope_rating: 132, par: 72 } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, opts] = (globalThis.fetch as never as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/tees/4/ratings/18");
    expect((opts as RequestInit).method).toBe("PUT");
  });
});

describe("useSetStrokeIndex", () => {
  beforeEach(() => localStorage.clear());
  it("PUTs stroke indexes for a course", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve([1, 2]),
    }) as never;
    const { result } = renderHook(() => useSetStrokeIndex(), { wrapper });
    result.current.mutate({ courseId: 7, stroke_indexes: [1, 2] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((globalThis.fetch as never as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
      "/api/courses/7/stroke-index",
    );
  });
});

describe("useCourseLibrary", () => {
  beforeEach(() => localStorage.clear());
  it("fetches imported courses", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve([]),
    }) as never;
    const { result } = renderHook(() => useCourseLibrary(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((globalThis.fetch as never as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("/api/courses/library");
  });
});

describe("useHandicap", () => {
  beforeEach(() => localStorage.clear());
  it("fetches GET /stats/handicap", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ index: null, low_index: null, cap_applied: null, cap_adjustment: null, rounds_needed: 3, differentials: [] }),
    }) as never;
    const { result } = renderHook(() => useHandicap(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((globalThis.fetch as never as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("/api/stats/handicap");
  });
});

describe("useRoundStats", () => {
  beforeEach(() => localStorage.clear());
  it("fetches GET /rounds/{id}/stats", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ score: 72, to_par: 0, fairways_hit: 0, fairways_possible: 0, fairway_pct: null, gir: 0, gir_pct: null, putts: 0, putts_per_gir: null, one_putts: 0, three_putts: 0, scrambling_pct: null, penalties: 0, differential: null, counts_toward_index: false, reason: "no tee set attached" }),
    }) as never;
    const { result } = renderHook(() => useRoundStats(5), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((globalThis.fetch as never as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("/api/rounds/5/stats");
  });
});

describe("useRoundTrends", () => {
  beforeEach(() => localStorage.clear());
  it("fetches GET /stats/rounds", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ rounds: [], averages: { score: null, putts: null, gir_pct: null, fairway_pct: null } }),
    }) as never;
    const { result } = renderHook(() => useRoundTrends(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((globalThis.fetch as never as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("/api/stats/rounds");
  });
});

describe("useCreateTee", () => {
  beforeEach(() => localStorage.clear());
  it("POSTs a tee set", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 201,
      json: () => Promise.resolve({ id: 2, course_id: 7, name: "White", yardage: 5800, ratings: [] }),
    }) as never;
    const { result } = renderHook(() => useCreateTee(), { wrapper });
    result.current.mutate({ courseId: 7, name: "White", yardage: 5800 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, opts] = (globalThis.fetch as never as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/courses/7/tees");
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({ name: "White", yardage: 5800 });
  });
});
```

Also change the existing `useCreateRound` test body assertion to still pass with `{ course_id: 3 }` — the hook's `mutationFn` will accept `RoundCreate`, which that payload satisfies.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/api/hooks.test.tsx`

Expected: FAIL — `useTees` is not exported.

- [ ] **Step 3: Implement client, types, fixtures, hooks, and fix existing fixtures**

`frontend/src/api/client.ts` — change the method union only:

```typescript
export async function apiSend<T>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
```

Create `frontend/src/testFixtures.ts`:

```typescript
import type { Course, Hole, Round, RoundHole } from "./api/types";

export function holeFixture(overrides: Partial<Hole> = {}): Hole {
  return {
    id: 1,
    course_id: 7,
    number: 1,
    par: 4,
    green_lat: null,
    green_lng: null,
    hazards: null,
    stroke_index: null,
    ...overrides,
  };
}

export function courseFixture(overrides: Partial<Course> = {}): Course {
  return {
    id: 7,
    name: "Pebble Beach",
    osm_id: "way/1",
    import_source: "osm",
    location_lat: 36.5,
    location_lng: -121.9,
    imported_at: "2026-07-19T00:00:00Z",
    holes: [holeFixture()],
    ...overrides,
  };
}

export function roundHoleFixture(overrides: Partial<RoundHole> = {}): RoundHole {
  return {
    hole_number: 1,
    par: 4,
    strokes: null,
    putts: null,
    fairway_hit: null,
    penalties: 0,
    ...overrides,
  };
}

export function roundFixture(overrides: Partial<Round> = {}): Round {
  return {
    id: 5,
    course_id: 7,
    date: "2026-07-19",
    status: "in_progress",
    current_hole: 1,
    tee_set_id: null,
    hole_count: 18,
    nine: null,
    course_rating: null,
    slope_rating: null,
    course_par: null,
    holes: [],
    ...overrides,
  };
}
```

Update every existing test that constructs `Round`, `Hole`, or `Course` with holes to use these helpers (or spread the extra fields). Minimum required extra fields if you edit inline instead of switching to helpers:

- `Hole`: `stroke_index: null`
- `RoundHole`: `putts: null, fairway_hit: null, penalties: 0`
- `Round`: `tee_set_id: null, hole_count: 18, nine: null, course_rating: null, slope_rating: null, course_par: null`

Files that must compile: `CourseDetail.test.tsx`, `LiveRound.test.tsx`, `RoundSummary.test.tsx`, `RoundHistory.test.tsx`, `hooks.test.tsx`, and any other `Course` hole literals (`CourseSearch.test.tsx` / `CourseNew.test.tsx` if they include `Hole` objects).

In `frontend/src/api/hooks.ts`, extend `keys` and add hooks. Replace `useCreateRound` / `useUpdateRoundHole` signatures; keep their URLs. Add handicap invalidation to hole/round mutations that can change an Index.

```typescript
import type {
  Club, Course, CourseSearchResult, Dashboard, GapRow, Handicap, ManualHoleInput,
  Nine, RatingScope, Round, RoundCreate, RoundStats, RoundStatus, RoundTrend,
  Session, Shot, ClubStats, TeeSet, TeeRating, User,
} from "./types";

export const keys = {
  clubs: ["clubs"] as const,
  sessions: ["sessions"] as const,
  shots: (id: number) => ["shots", id] as const,
  clubStats: (id: number) => ["clubStats", id] as const,
  gapping: ["gapping"] as const,
  dashboard: ["dashboard"] as const,
  me: ["me"] as const,
  courseSearch: (search: string) => ["courseSearch", search] as const,
  course: (id: number) => ["course", id] as const,
  courseLibrary: ["courseLibrary"] as const,
  rounds: ["rounds"] as const,
  round: (id: number) => ["round", id] as const,
  tees: (courseId: number) => ["tees", courseId] as const,
  handicap: ["handicap"] as const,
  roundStats: (id: number) => ["roundStats", id] as const,
  roundTrends: ["roundTrends"] as const,
};
```

Queries to add:

```typescript
export const useTees = (courseId: number) =>
  useQuery({ queryKey: keys.tees(courseId), queryFn: () => apiGet<TeeSet[]>(`/courses/${courseId}/tees`), enabled: courseId > 0 });
export const useCourseLibrary = () =>
  useQuery({ queryKey: keys.courseLibrary, queryFn: () => apiGet<Course[]>("/courses/library") });
export const useHandicap = () =>
  useQuery({ queryKey: keys.handicap, queryFn: () => apiGet<Handicap>("/stats/handicap") });
export const useRoundStats = (id: number) =>
  useQuery({ queryKey: keys.roundStats(id), queryFn: () => apiGet<RoundStats>(`/rounds/${id}/stats`), enabled: id > 0 });
export const useRoundTrends = () =>
  useQuery({ queryKey: keys.roundTrends, queryFn: () => apiGet<RoundTrend>("/stats/rounds") });
```

Mutations to add (invalidate `keys.tees(courseId)` and `keys.course(courseId)` on tee/rating/stroke-index success; `useCreateTee` also invalidates `keys.courseLibrary` is unnecessary — library is courses, not tees):

```typescript
export function useCreateTee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, name, yardage }: { courseId: number; name: string; yardage?: number | null }) =>
      apiSend<TeeSet>("POST", `/courses/${courseId}/tees`, { name, yardage }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: keys.tees(vars.courseId) }),
  });
}
export function useUpsertTeeRating() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      teeId, scope, body, courseId,
    }: { teeId: number; scope: RatingScope; courseId: number; body: { course_rating: number; slope_rating: number; par: number } }) =>
      apiSend<TeeRating>("PUT", `/tees/${teeId}/ratings/${scope}`, body),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: keys.tees(vars.courseId) }),
  });
}
export function useSetStrokeIndex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, stroke_indexes }: { courseId: number; stroke_indexes: number[] }) =>
      apiSend<number[]>("PUT", `/courses/${courseId}/stroke-index`, { stroke_indexes }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.course(vars.courseId) });
    },
  });
}
```

Replace `useCreateRound`:

```typescript
export function useCreateRound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RoundCreate) => apiSend<Round>("POST", "/rounds", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.rounds });
      qc.invalidateQueries({ queryKey: keys.handicap });
      qc.invalidateQueries({ queryKey: keys.roundTrends });
    },
  });
}
```

Replace `useUpdateRoundHole`:

```typescript
export function useUpdateRoundHole(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      number, ...body
    }: { number: number; strokes?: number; putts?: number | null; fairway_hit?: boolean | null; penalties?: number }) =>
      apiSend<Round>("PATCH", `/rounds/${id}/holes/${number}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.round(id) });
      qc.invalidateQueries({ queryKey: keys.roundStats(id) });
      qc.invalidateQueries({ queryKey: keys.handicap });
      qc.invalidateQueries({ queryKey: keys.roundTrends });
    },
  });
}
```

Also invalidate `keys.handicap` and `keys.roundTrends` from `useUpdateRound` (finishing a round changes the Index).

- [ ] **Step 4: Run tests and type-check**

Run: `cd frontend && npx vitest run src/api/hooks.test.tsx && npx tsc -b --noEmit && npx vitest run`

Expected: all existing frontend tests plus the new hook tests PASS; `tsc` clean. If a fixture file was missed, `tsc` will name it — fix it in this task, not later.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/api/types.ts frontend/src/testFixtures.ts frontend/src/api/hooks.ts frontend/src/api/hooks.test.tsx frontend/src/routes/*.test.tsx
git commit -m "Add Pillar 3 API types and hooks"
```

---

### Task 3: Tee setup screen

**Files:**
- Create: `frontend/src/strokeIndex.ts`
- Test: `frontend/src/strokeIndex.test.ts`
- Create: `frontend/src/routes/TeeSetup.tsx`
- Test: `frontend/src/routes/TeeSetup.test.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useCourse`, `useTees`, `useCreateTee`, `useUpsertTeeRating`, `useSetStrokeIndex` (Task 2). Stroke indexes are per-course, not per tee (spec decision 2026-09-03).
- Produces: route `/courses/:id/tees`. Client-side `isStrokeIndexPermutation(values: number[], n: number): boolean` — true iff `values` is a permutation of `1..n`.

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/strokeIndex.test.ts
import { describe, it, expect } from "vitest";
import { isStrokeIndexPermutation } from "./strokeIndex";

describe("isStrokeIndexPermutation", () => {
  it("accepts 1..n in any order", () => {
    expect(isStrokeIndexPermutation([2, 1, 3], 3)).toBe(true);
  });
  it("rejects duplicates, gaps, and the wrong length", () => {
    expect(isStrokeIndexPermutation([1, 1, 3], 3)).toBe(false);
    expect(isStrokeIndexPermutation([1, 2], 3)).toBe(false);
    expect(isStrokeIndexPermutation([1, 2, 4], 3)).toBe(false);
  });
});
```

```typescript
// frontend/src/routes/TeeSetup.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TeeSetup } from "./TeeSetup";
import { useCourse, useTees, useCreateTee, useUpsertTeeRating, useSetStrokeIndex } from "../api/hooks";
import { courseFixture, holeFixture } from "../testFixtures";
import type { TeeSet } from "../api/types";

vi.mock("../api/hooks", () => ({
  useCourse: vi.fn(),
  useTees: vi.fn(),
  useCreateTee: vi.fn(),
  useUpsertTeeRating: vi.fn(),
  useSetStrokeIndex: vi.fn(),
}));

const mockedUseCourse = vi.mocked(useCourse);
const mockedUseTees = vi.mocked(useTees);
const mockedUseCreateTee = vi.mocked(useCreateTee);
const mockedUseUpsertTeeRating = vi.mocked(useUpsertTeeRating);
const mockedUseSetStrokeIndex = vi.mocked(useSetStrokeIndex);

const course = courseFixture({
  holes: [
    holeFixture({ id: 1, number: 1, par: 4, stroke_index: 7 }),
    holeFixture({ id: 2, number: 2, par: 3, stroke_index: 1 }),
  ],
});
const tees: TeeSet[] = [{ id: 4, course_id: 7, name: "Blue", yardage: 6200, ratings: [] }];

function setup() {
  const createTee = { mutate: vi.fn() };
  const upsert = { mutate: vi.fn() };
  const setSi = { mutate: vi.fn() };
  mockedUseCourse.mockReturnValue({ data: course, isLoading: false, error: null } as unknown as ReturnType<typeof useCourse>);
  mockedUseTees.mockReturnValue({ data: tees, isLoading: false, error: null } as unknown as ReturnType<typeof useTees>);
  mockedUseCreateTee.mockReturnValue(createTee as unknown as ReturnType<typeof useCreateTee>);
  mockedUseUpsertTeeRating.mockReturnValue(upsert as unknown as ReturnType<typeof useUpsertTeeRating>);
  mockedUseSetStrokeIndex.mockReturnValue(setSi as unknown as ReturnType<typeof useSetStrokeIndex>);
  render(
    <MemoryRouter initialEntries={["/courses/7/tees"]}>
      <Routes>
        <Route path="/courses/:id/tees" element={<TeeSetup />} />
      </Routes>
    </MemoryRouter>,
  );
  return { createTee, upsert, setSi };
}

describe("TeeSetup", () => {
  beforeEach(() => {
    mockedUseCourse.mockReset();
    mockedUseTees.mockReset();
    mockedUseCreateTee.mockReset();
    mockedUseUpsertTeeRating.mockReset();
    mockedUseSetStrokeIndex.mockReset();
  });

  it("lists existing tee sets", () => {
    setup();
    expect(screen.getByText("Blue")).toBeInTheDocument();
  });

  it("creates a tee set", async () => {
    const { createTee } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Tee name"), "White");
    await user.type(screen.getByLabelText("Yardage"), "5800");
    await user.click(screen.getByRole("button", { name: "Add tee" }));
    expect(createTee.mutate).toHaveBeenCalledWith(
      { courseId: 7, name: "White", yardage: 5800 },
      expect.anything(),
    );
  });

  it("saves an 18-hole rating", async () => {
    const { upsert } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Course rating"), "71.2");
    await user.type(screen.getByLabelText("Slope"), "132");
    await user.type(screen.getByLabelText("Par"), "7");
    await user.click(screen.getByRole("button", { name: "Save 18-hole rating" }));
    expect(upsert.mutate).toHaveBeenCalledWith(
      { teeId: 4, courseId: 7, scope: "18", body: { course_rating: 71.2, slope_rating: 132, par: 7 } },
      expect.anything(),
    );
  });

  it("rejects a rating par that does not match the hole pars", async () => {
    const { upsert } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Course rating"), "71.2");
    await user.type(screen.getByLabelText("Slope"), "132");
    await user.type(screen.getByLabelText("Par"), "72");
    await user.click(screen.getByRole("button", { name: "Save 18-hole rating" }));
    expect(upsert.mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/must equal the sum of hole pars/)).toBeInTheDocument();
  });

  it("rejects a slope outside 55–155 before calling the API", async () => {
    const { upsert } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Course rating"), "71.2");
    await user.type(screen.getByLabelText("Slope"), "200");
    await user.type(screen.getByLabelText("Par"), "72");
    await user.click(screen.getByRole("button", { name: "Save 18-hole rating" }));
    expect(upsert.mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/Slope must be between 55 and 155/)).toBeInTheDocument();
  });

  it("pre-fills stroke indexes from the course and saves a permutation", async () => {
    const { setSi } = setup();
    const user = userEvent.setup();
    expect(screen.getByLabelText("Hole 1 stroke index")).toHaveValue(7);
    await user.clear(screen.getByLabelText("Hole 1 stroke index"));
    await user.type(screen.getByLabelText("Hole 1 stroke index"), "2");
    await user.clear(screen.getByLabelText("Hole 2 stroke index"));
    await user.type(screen.getByLabelText("Hole 2 stroke index"), "1");
    await user.click(screen.getByRole("button", { name: "Save stroke indexes" }));
    expect(setSi.mutate).toHaveBeenCalledWith(
      { courseId: 7, stroke_indexes: [2, 1] },
      expect.anything(),
    );
  });

  it("does not save a non-permutation of stroke indexes", async () => {
    const { setSi } = setup();
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Hole 1 stroke index"));
    await user.type(screen.getByLabelText("Hole 1 stroke index"), "1");
    await user.clear(screen.getByLabelText("Hole 2 stroke index"));
    await user.type(screen.getByLabelText("Hole 2 stroke index"), "1");
    await user.click(screen.getByRole("button", { name: "Save stroke indexes" }));
    expect(setSi.mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/permutation of 1/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/strokeIndex.test.ts src/routes/TeeSetup.test.tsx`

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

```typescript
// frontend/src/strokeIndex.ts
export function isStrokeIndexPermutation(values: number[], n: number): boolean {
  if (values.length !== n) return false;
  if (!values.every((v) => Number.isInteger(v))) return false;
  return [...values].sort((a, b) => a - b).every((v, i) => v === i + 1);
}
```

`TeeSetup.tsx` — a single page with: heading `{course.name} tees`; list of tee names + yardage; add-tee form (`Tee name`, `Yardage`, `Add tee`); for the first tee (or a selected tee if more than one — a `<select aria-label="Tee to rate">` when `tees.length > 1`) the 18-hole rating fields (`Course rating`, `Slope`, `Par`) and `Save 18-hole rating`; optional front/back 9 fields with `Save front-9 rating` / `Save back-9 rating` using the same slope check; a stroke-index input per hole (`aria-label={`Hole ${n} stroke index`}`) prefilled from `course.holes`; `Save stroke indexes` running `isStrokeIndexPermutation` against `course.holes.length`. Slope must be an integer 55–155 inclusive; show `Slope must be between 55 and 155.` and do not call the API. Check slope **before** par-sum so a bad slope is reported even when par is also wrong. When every hole in the rating's scope has a non-null `par`, the rating `par` must equal that sum — otherwise show `Par must equal the sum of hole pars.` and do not call the API (skip the check if any hole par is null). 18-hole scope uses all holes; front-9 uses holes 1–9; back-9 uses holes 10–18. Use the existing dismissible `actionError` banner for mutation errors. Include a `Link` back to `/courses/:id`.

If `tees.length === 0`, hide the rating form and show `Add a tee before entering ratings.`

Wire the route in `App.tsx`:

```typescript
import { TeeSetup } from "./routes/TeeSetup";
```

```typescript
        <Route path="courses/:id/tees" element={<TeeSetup />} />
```

Place it next to `courses/:id`.

- [ ] **Step 4: Run tests and type-check**

Run: `cd frontend && npx vitest run src/strokeIndex.test.ts src/routes/TeeSetup.test.tsx && npx tsc -b --noEmit`

Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/strokeIndex.ts frontend/src/strokeIndex.test.ts frontend/src/routes/TeeSetup.tsx frontend/src/routes/TeeSetup.test.tsx frontend/src/App.tsx
git commit -m "Add tee and stroke-index setup"
```

---

### Task 4: Course detail — tee picker, 9/18, links

**Files:**
- Modify: `frontend/src/routes/CourseDetail.tsx`
- Modify: `frontend/src/routes/CourseDetail.test.tsx`

**Interfaces:**
- Consumes: `useTees`, `useCreateRound` (now `RoundCreate`). Resume-round behaviour is unchanged.
- Produces: Start round sends `tee_set_id: null` when "No tee" is selected, `hole_count` `9 | 18`, and `nine` when 9. Links to `/courses/:id/tees` and `/rounds/new?course=:id`.

- [ ] **Step 1: Write the failing tests**

Add to `CourseDetail.test.tsx` (mock `useTees` in the existing `vi.mock` and default it to `{ data: [], isLoading: false, error: null }` in `renderAt` so old tests still run). Import `roundFixture`.

```typescript
vi.mock("../api/hooks", () => ({
  useCourse: vi.fn(),
  useRounds: vi.fn(),
  useCreateRound: vi.fn(),
  useTees: vi.fn(),
}));
```

Keep the existing three tests. Change the Start-round assertion: after clicking Start with no tees, `mutate` is called with `{ course_id: 7, tee_set_id: null, hole_count: 18 }`.

Add:

```typescript
it("sends the selected tee and a 9-hole front nine", async () => {
  const { create } = renderAt([], [
    { id: 4, course_id: 7, name: "Blue", yardage: 6200, ratings: [] },
  ]);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Tee"), "4");
  await user.selectOptions(screen.getByLabelText("Holes"), "9");
  await user.selectOptions(screen.getByLabelText("Nine"), "front");
  await user.click(screen.getByRole("button", { name: "Start round" }));
  expect(create.mutate).toHaveBeenCalledWith(
    { course_id: 7, tee_set_id: 4, hole_count: 9, nine: "front" },
    expect.objectContaining({ onSuccess: expect.any(Function) }),
  );
});

it("links to tee setup and backlog entry", () => {
  renderAt([]);
  expect(screen.getByRole("link", { name: "Set up tees" })).toHaveAttribute("href", "/courses/7/tees");
  expect(screen.getByRole("link", { name: "Enter a past round" })).toHaveAttribute("href", "/rounds/new?course=7");
});
```

Extend `renderAt(rounds, tees = [])` to mock `useTees`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/routes/CourseDetail.test.tsx`

Expected: FAIL — missing tee select / links.

- [ ] **Step 3: Implement**

In `CourseDetail`, `useTees(courseId)`. Above the Start button (only when there is no `activeRound`):

- `<select aria-label="Tee">` with option `value=""` labelled `No tee (won't count toward Index)` plus one option per tee (`value={tee.id}`, label `tee.name`).
- `<select aria-label="Holes">` options `18` and `9`, default 18.
- When holes is 9, `<select aria-label="Nine">` options `front` / `back`.
- `onStart` sends `{ course_id, tee_set_id: teeId === "" ? null : Number(teeId), hole_count: 9|18, nine?: "front"|"back" }`. Do not send `nine` for 18-hole rounds (the API 422s).
- Links: `Set up tees` → `/courses/${courseId}/tees`; `Enter a past round` → `/rounds/new?course=${courseId}`.

Leave hole list and Resume round as they are.

- [ ] **Step 4: Run tests and type-check**

Run: `cd frontend && npx vitest run src/routes/CourseDetail.test.tsx && npx tsc -b --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/CourseDetail.tsx frontend/src/routes/CourseDetail.test.tsx
git commit -m "Let a round start from a chosen tee"
```

---

### Task 5: Live round — putts, fairway, penalties

**Files:**
- Modify: `frontend/src/routes/LiveRound.tsx`
- Modify: `frontend/src/routes/LiveRound.test.tsx`

**Interfaces:**
- Consumes: extended `useUpdateRoundHole`. Strokes-only still works (putts/fairway omitted).
- Produces: one extra control row on the current hole. Par 3 → no fairway control.

- [ ] **Step 1: Write the failing tests**

Add to `LiveRound.test.tsx`. Existing "saves strokes" test must keep passing — `mutate` is still called with `{ number: 1, strokes: 5 }` when putts/fairway/penalties are left blank.

```typescript
it("saves putts and a fairway hit with strokes on a par 4", async () => {
  const { updateHole } = setup();
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Strokes"), "5");
  await user.type(screen.getByPlaceholderText("Putts"), "2");
  await user.click(screen.getByRole("button", { name: "Fairway hit" }));
  await user.click(screen.getByRole("button", { name: "Save strokes" }));
  expect(updateHole.mutate).toHaveBeenCalledWith(
    { number: 1, strokes: 5, putts: 2, fairway_hit: true },
    expect.objectContaining({ onSuccess: expect.any(Function) }),
  );
});

it("hides the fairway control on a par 3", () => {
  setup(roundFixture({
    current_hole: 2,
    holes: [
      roundHoleFixture({ hole_number: 1, par: 4 }),
      roundHoleFixture({ hole_number: 2, par: 3 }),
    ],
  }));
  expect(screen.queryByRole("button", { name: "Fairway hit" })).not.toBeInTheDocument();
});
```

The default fixture hole 1 is par 4, so the first new test can use `setup()`. Import `roundFixture` / `roundHoleFixture`. The existing `round` constant should be `roundFixture({ holes: [roundHoleFixture({ hole_number: 1, par: 4 }), roundHoleFixture({ hole_number: 2, par: 3 })] })`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/routes/LiveRound.test.tsx`

Expected: FAIL — missing Putts / Fairway hit.

- [ ] **Step 3: Implement**

On `LiveRound`, next to the strokes input:

- `input` `placeholder="Putts"` `inputMode="numeric"` `aria-label="Putts"`.
- If `currentHole.par !== 3`: two buttons `Fairway hit` and `Fairway miss`. Selecting one sets local state `fairway: boolean | null`. Visual: selected button uses `bg-green-600 text-white`.
- Optional `input` `placeholder="Penalties"` `aria-label="Penalties"`. Empty means omit (do not send 0 unless the user typed 0).
- `onSaveStrokes` still requires valid strokes. Build the mutate payload as `{ number, strokes, ...(puttsInput !== "" ? { putts: Number(puttsInput) } : {}), ...(fairway !== null ? { fairway_hit: fairway } : {}), ...(penaltiesInput !== "" ? { penalties: Number(penaltiesInput) } : {}) }`. Validate putts/penalties the same way as strokes (integer, putts ≥ 0, penalties ≥ 0) when provided.
- Clear putts/fairway/penalties local state on successful save and on `onAdvance` (same reason as clearing strokes — the component does not remount).

Do not change GPS shot logging.

- [ ] **Step 4: Run tests and type-check**

Run: `cd frontend && npx vitest run src/routes/LiveRound.test.tsx && npx tsc -b --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/LiveRound.tsx frontend/src/routes/LiveRound.test.tsx
git commit -m "Capture putts and fairways during a live round"
```

---

### Task 6: Round summary — stat strip and hole-detail editing

**Files:**
- Modify: `frontend/src/routes/RoundSummary.tsx`
- Modify: `frontend/src/routes/RoundSummary.test.tsx`

**Interfaces:**
- Consumes: `useRound`, `useCourse`, `useRoundStats`, `useUpdateRoundHole`.
- Produces: derived stat strip from the server; per-hole putts/fairway/penalties editable via PATCH.

- [ ] **Step 1: Write the failing tests**

Mock `useRoundStats` and `useUpdateRoundHole` in the existing `vi.mock`. Default stats:

```typescript
const stats = {
  score: 8, to_par: 1, fairways_hit: 0, fairways_possible: 1, fairway_pct: 0,
  gir: 1, gir_pct: 50, putts: 3, putts_per_gir: 2, one_putts: 0, three_putts: 0,
  scrambling_pct: null, penalties: 0, differential: 1.2, counts_toward_index: true, reason: null,
};
```

Add tests:

```typescript
it("shows derived round stats from the server", () => {
  setup();
  expect(screen.getByText("GIR")).toBeInTheDocument();
  expect(screen.getByText("50%")).toBeInTheDocument();
  expect(screen.getByText("Diff")).toBeInTheDocument();
  expect(screen.getByText("1.2")).toBeInTheDocument();
});

it("shows the named reason when the round does not count toward the Index", () => {
  setup({
    stats: { ...stats, counts_toward_index: false, differential: null, reason: "9-hole rounds do not count toward the Index" },
  });
  expect(screen.getByText("9-hole rounds do not count toward the Index")).toBeInTheDocument();
});

it("patches putts for a hole", async () => {
  const { updateHole } = setup();
  const user = userEvent.setup();
  const putts = screen.getAllByLabelText("Putts")[0];
  await user.clear(putts);
  await user.type(putts, "2");
  await user.tab();
  expect(updateHole.mutate).toHaveBeenCalledWith(
    { number: 1, putts: 2 },
    expect.anything(),
  );
});
```

Keep the existing total / vs-par tests. Hole rows still show `Hole 1 (Par 4)` and strokes.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/routes/RoundSummary.test.tsx`

Expected: FAIL — GIR / Diff not rendered.

- [ ] **Step 3: Implement**

Use `useRoundStats(Number(id))` and `useUpdateRoundHole(Number(id))`. Below the scorecard list, a strip of `StatCard`s (already in `components/StatCard.tsx`):

| label | value |
|---|---|
| Score | `stats.score` |
| To par | `E` / `+N` / `N` from `stats.to_par` |
| Fairways | `fairway_pct == null ? "—" : `${Math.round(fairway_pct)}%`` |
| GIR | same with `gir_pct` |
| Putts | `stats.putts` |
| Scrambling | same with `scrambling_pct` |
| Diff | `differential == null ? "—" : String(differential)` |

If `stats.reason` is non-null, show it as `text-sm text-gray-500` under the strip.

On each hole row, after strokes: `input aria-label="Putts"` defaulting to `h.putts ?? ""`; if `h.par !== 3`, buttons `Fairway hit` / `Fairway miss` reflecting `h.fairway_hit`; `input aria-label="Penalties"` defaulting to `h.penalties`. On blur (putts/penalties) or click (fairway), call `updateHole.mutate` with that field only. Existing totals at the bottom stay (they already sum `round.holes`).

- [ ] **Step 4: Run tests and type-check**

Run: `cd frontend && npx vitest run src/routes/RoundSummary.test.tsx && npx tsc -b --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/RoundSummary.tsx frontend/src/routes/RoundSummary.test.tsx
git commit -m "Show round stats and let hole detail be edited"
```

---

### Task 7: Fast backlog entry

**Files:**
- Create: `frontend/src/routes/RoundEntry.tsx`
- Test: `frontend/src/routes/RoundEntry.test.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useCourseLibrary`, `useCourse`, `useTees`, `useCreateRound`. Query `?course=` preselects a course.
- Produces: route `/rounds/new`. `POST /rounds` with `status: "completed"`, explicit `date`, optional `tee_set_id`, `hole_count`/`nine`, and `holes: [{ number, strokes, putts?, fairway_hit?, penalties? }]`. On success, navigate to `/rounds/{id}/summary`.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/routes/RoundEntry.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RoundEntry } from "./RoundEntry";
import { useCourseLibrary, useCourse, useTees, useCreateRound } from "../api/hooks";
import { courseFixture, holeFixture } from "../testFixtures";
import type { TeeSet } from "../api/types";

vi.mock("../api/hooks", () => ({
  useCourseLibrary: vi.fn(),
  useCourse: vi.fn(),
  useTees: vi.fn(),
  useCreateRound: vi.fn(),
}));

const mockedLib = vi.mocked(useCourseLibrary);
const mockedUseCourse = vi.mocked(useCourse);
const mockedUseTees = vi.mocked(useTees);
const mockedCreate = vi.mocked(useCreateRound);

const course = courseFixture({
  holes: [
    holeFixture({ number: 1, par: 4 }),
    holeFixture({ number: 2, par: 3 }),
  ],
});
const tees: TeeSet[] = [{ id: 4, course_id: 7, name: "Blue", yardage: 6200, ratings: [] }];

function setup(entry = "/rounds/new?course=7") {
  const create = { mutate: vi.fn() };
  mockedLib.mockReturnValue({ data: [course], isLoading: false, error: null } as unknown as ReturnType<typeof useCourseLibrary>);
  mockedUseCourse.mockReturnValue({ data: course, isLoading: false, error: null } as unknown as ReturnType<typeof useCourse>);
  mockedUseTees.mockReturnValue({ data: tees, isLoading: false, error: null } as unknown as ReturnType<typeof useTees>);
  mockedCreate.mockReturnValue(create as unknown as ReturnType<typeof useCreateRound>);
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/rounds/new" element={<RoundEntry />} />
      </Routes>
    </MemoryRouter>,
  );
  return { create };
}

describe("RoundEntry", () => {
  beforeEach(() => {
    mockedLib.mockReset();
    mockedUseCourse.mockReset();
    mockedUseTees.mockReset();
    mockedCreate.mockReset();
  });

  it("submits a completed round with date, tee, and hole scores", async () => {
    const { create } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Date"), "2026-06-01");
    await user.selectOptions(screen.getByLabelText("Tee"), "4");
    await user.type(screen.getByLabelText("Hole 1 strokes"), "5");
    await user.type(screen.getByLabelText("Hole 2 strokes"), "3");
    await user.click(screen.getByRole("button", { name: "Save round" }));
    expect(create.mutate).toHaveBeenCalledWith(
      {
        course_id: 7,
        date: "2026-06-01",
        tee_set_id: 4,
        hole_count: 18,
        status: "completed",
        holes: [
          { number: 1, strokes: 5 },
          { number: 2, strokes: 3 },
        ],
      },
      expect.anything(),
    );
  });

  it("requires a date before submitting", async () => {
    const { create } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Hole 1 strokes"), "5");
    await user.click(screen.getByRole("button", { name: "Save round" }));
    expect(create.mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/must state its date/i)).toBeInTheDocument();
  });

  it("includes putts and fairway when full detail is on", async () => {
    const { create } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Date"), "2026-06-01");
    await user.click(screen.getByRole("checkbox", { name: "Full detail" }));
    await user.type(screen.getByLabelText("Hole 1 strokes"), "5");
    await user.type(screen.getByLabelText("Hole 1 putts"), "2");
    await user.click(screen.getByRole("button", { name: "Hole 1 fairway hit" }));
    await user.type(screen.getByLabelText("Hole 2 strokes"), "3");
    await user.click(screen.getByRole("button", { name: "Save round" }));
    expect(create.mutate.mock.calls[0][0]).toEqual(expect.objectContaining({
      date: "2026-06-01",
      status: "completed",
      holes: [
        { number: 1, strokes: 5, putts: 2, fairway_hit: true },
        { number: 2, strokes: 3 },
      ],
    }));
  });
});
```

Holes with no strokes entered are omitted from the `holes` array (the API treats missing `RoundHole.strokes` as not played). Do not send `strokes: null`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/routes/RoundEntry.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`RoundEntry` layout (single page, no per-hole navigation):

1. Course `<select aria-label="Course">` from `useCourseLibrary`; initialise from `useSearchParams().get("course")`.
2. Date `<input type="date" aria-label="Date">`.
3. Tee `<select aria-label="Tee">` including `No tee (won't count toward Index)`.
4. Holes `18`/`9` + Nine when 9. When 9, the score grid is only the holes whose numbers are 1–9 (front) or 10–18 (back); if the course has fewer holes, show the holes it has.
5. Checkbox `Full detail` (unchecked by default) — reveals putts / fairway / penalties columns.
6. One row per hole: hole number, par (read-only), `input aria-label={`Hole ${n} strokes`}` `inputMode="numeric"`. Full detail: `Hole ${n} putts`, `Hole ${n} fairway hit` / `Hole ${n} fairway miss` (hidden on par 3), `Hole ${n} penalties`.
7. `Save round` builds `RoundCreate` and `mutate`s. Navigate on success. Dismissible `actionError` on failure.
8. Empty library: `AsyncBoundary` emptyText `Import a course before entering a past round.` plus a link to `/courses`.

9-hole `hole_count: 9` with `nine`. 18-hole: do not send `nine`. `tee_set_id: null` when none selected.

Tab order follows the grid (native inputs). Do not add a date picker library.

Route: `rounds/new` **before** `rounds/:id` in `App.tsx` so `new` is not parsed as an id.

```typescript
import { RoundEntry } from "./routes/RoundEntry";
```

```typescript
        <Route path="rounds/new" element={<RoundEntry />} />
```

- [ ] **Step 4: Run tests and type-check**

Run: `cd frontend && npx vitest run src/routes/RoundEntry.test.tsx && npx tsc -b --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/RoundEntry.tsx frontend/src/routes/RoundEntry.test.tsx frontend/src/App.tsx
git commit -m "Add fast backlog round entry"
```

---

### Task 8: Handicap screen

**Files:**
- Create: `frontend/src/components/Sparkline.tsx`
- Test: `frontend/src/components/Sparkline.test.tsx`
- Create: `frontend/src/routes/Handicap.tsx`
- Test: `frontend/src/routes/Handicap.test.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useHandicap`. `Sparkline` takes `values: number[]` and renders an SVG polyline; omit the svg when `values.length < 2`.
- Produces: route `/handicap`. Copy: `This Index is for personal use and is not an official World Handicap System record.`

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/components/Sparkline.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sparkline } from "./Sparkline";

describe("Sparkline", () => {
  it("renders a trend svg when there are at least two points", () => {
    render(<Sparkline values={[12.4, 12.1, 11.8]} />);
    expect(screen.getByRole("img", { name: "Trend" })).toBeInTheDocument();
  });
  it("renders nothing with fewer than two points", () => {
    const { container } = render(<Sparkline values={[12.4]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

```typescript
// frontend/src/routes/Handicap.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Handicap } from "./Handicap";
import { useHandicap } from "../api/hooks";
import type { Handicap as HandicapData } from "../api/types";

vi.mock("../api/hooks", () => ({ useHandicap: vi.fn() }));
const mocked = vi.mocked(useHandicap);

const empty: HandicapData = {
  index: null, low_index: null, cap_applied: null, cap_adjustment: null,
  rounds_needed: 3, differentials: [],
};
const established: HandicapData = {
  index: 12.4, low_index: 11.0, cap_applied: "soft", cap_adjustment: 0.4, rounds_needed: 0,
  differentials: [
    { round_id: 1, date: "2026-06-01", differential: 13.1, counts_toward_index: true, reason: null, is_counting: true, index_after: 13.2 },
    { round_id: 2, date: "2026-06-08", differential: 11.2, counts_toward_index: true, reason: null, is_counting: true, index_after: 12.4 },
    { round_id: 3, date: "2026-06-15", differential: null, counts_toward_index: false, reason: "9-hole rounds do not count toward the Index", is_counting: false, index_after: 12.4 },
  ],
};

function setup(data: HandicapData) {
  mocked.mockReturnValue({ data, isLoading: false, error: null } as unknown as ReturnType<typeof useHandicap>);
  render(<Handicap />, { wrapper: MemoryRouter });
}

describe("Handicap", () => {
  beforeEach(() => mocked.mockReset());

  it("says the Index is unofficial", () => {
    setup(empty);
    expect(screen.getByText("This Index is for personal use and is not an official World Handicap System record.")).toBeInTheDocument();
  });

  it("shows how many rounds are needed when there is no Index", () => {
    setup(empty);
    expect(screen.getByText(/3 more/)).toBeInTheDocument();
  });

  it("shows the Index, Low Index, cap, counting differentials, and a named exclusion reason", () => {
    setup(established);
    expect(screen.getByText("12.4")).toBeInTheDocument();
    expect(screen.getByText("11.0")).toBeInTheDocument();
    expect(screen.getByText(/Soft cap/)).toBeInTheDocument();
    expect(screen.getByText("13.1")).toBeInTheDocument();
    expect(screen.getByText("9-hole rounds do not count toward the Index")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/Sparkline.test.tsx src/routes/Handicap.test.tsx`

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

```typescript
// frontend/src/components/Sparkline.tsx
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 160;
  const h = 40;
  const pad = 2;
  const points = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - 2 * pad);
      const y = h - pad - ((v - min) / span) * (h - 2 * pad);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-40 text-green-700" role="img" aria-label="Trend">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} />
    </svg>
  );
}
```

`Handicap.tsx`:

- `h1`: `Handicap Index`
- Disclaimer paragraph, the exact sentence from Global Constraints.
- If `index == null`: `Need {rounds_needed} more acceptable round{s} to establish an Index.`
- Else: `StatCard` `Index` = `index.toFixed(1)`; `Low Index` = `low_index ?? "—"`; if `cap_applied` is `soft`/`hard`, text `Soft cap applied` / `Hard cap applied` and the `cap_adjustment` amount.
- `Sparkline` of `differentials.map(d => d.index_after).filter((v): v is number => v != null)` in chronological order (API already returns chronological).
- Table: date, differential (or `—`), reason if any. Rows with `is_counting` get `bg-green-50` and `aria-label="Counts toward Index"`.

Route: `path="handicap" element={<Handicap />}`.

- [ ] **Step 4: Run tests and type-check**

Run: `cd frontend && npx vitest run src/components/Sparkline.test.tsx src/routes/Handicap.test.tsx && npx tsc -b --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Sparkline.tsx frontend/src/components/Sparkline.test.tsx frontend/src/routes/Handicap.tsx frontend/src/routes/Handicap.test.tsx frontend/src/App.tsx
git commit -m "Add the Handicap Index screen"
```

---

### Task 9: Dashboard, nav, and round history

**Files:**
- Modify: `frontend/src/routes/Dashboard.tsx`
- Create: `frontend/src/routes/Dashboard.test.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Modify: `frontend/src/routes/RoundHistory.tsx`
- Modify: `frontend/src/routes/RoundHistory.test.tsx`

**Interfaces:**
- Consumes: `useDashboard` (existing), `useHandicap`, `useRoundTrends`, `Sparkline`.
- Produces: Dashboard shows Index + unofficial disclaimer + score sparkline from `useRoundTrends().rounds` (newest last — reverse the API's newest-first list). Layout gains `{ to: "/handicap", label: "Handicap" }` after Gapping. Round history: `abandoned` links to summary like `completed`; `Enter a past round` → `/rounds/new`.

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/routes/Dashboard.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Dashboard } from "./Dashboard";
import { useDashboard, useHandicap, useRoundTrends } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import type { Dashboard as DashboardData, Handicap, RoundTrend, User } from "../api/types";

vi.mock("../api/hooks", () => ({
  useDashboard: vi.fn(),
  useHandicap: vi.fn(),
  useRoundTrends: vi.fn(),
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: vi.fn() }));

const mockedDash = vi.mocked(useDashboard);
const mockedHcp = vi.mocked(useHandicap);
const mockedTrends = vi.mocked(useRoundTrends);
const mockedAuth = vi.mocked(useAuth);

const user: User = {
  id: 1, email: "a@b.c", display_name: "A", is_admin: false, unit_preference: "yards", created_at: "",
};

function setup(hcp: Handicap) {
  mockedAuth.mockReturnValue({ user } as unknown as ReturnType<typeof useAuth>);
  mockedDash.mockReturnValue({
    data: { clubs: [], gapping: [] } satisfies DashboardData,
    isLoading: false, error: null,
  } as unknown as ReturnType<typeof useDashboard>);
  mockedHcp.mockReturnValue({ data: hcp, isLoading: false, error: null } as unknown as ReturnType<typeof useHandicap>);
  mockedTrends.mockReturnValue({
    data: { rounds: [], averages: { score: null, putts: null, gir_pct: null, fairway_pct: null } } satisfies RoundTrend,
    isLoading: false, error: null,
  } as unknown as ReturnType<typeof useRoundTrends>);
  render(<Dashboard />, { wrapper: MemoryRouter });
}

describe("Dashboard", () => {
  beforeEach(() => {
    mockedDash.mockReset();
    mockedHcp.mockReset();
    mockedTrends.mockReset();
    mockedAuth.mockReset();
  });

  it("shows the unofficial Index", () => {
    setup({
      index: 12.4, low_index: null, cap_applied: null, cap_adjustment: null, rounds_needed: 0, differentials: [],
    });
    expect(screen.getByText("12.4")).toBeInTheDocument();
    expect(screen.getByText("This Index is for personal use and is not an official World Handicap System record.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Handicap" })).toHaveAttribute("href", "/handicap");
  });
});
```

Add to `RoundHistory.test.tsx`:

```typescript
it("links an abandoned round to its summary", () => {
  mockedUseRounds.mockReturnValue({
    data: [roundFixture({ id: 3, status: "abandoned", current_hole: 12 })],
    isLoading: false, error: null,
  } as unknown as ReturnType<typeof useRounds>);
  mockedUseCourse.mockReturnValue({
    data: courseFor(7), isLoading: false, error: null,
  } as unknown as ReturnType<typeof useCourse>);
  render(<RoundHistory />, { wrapper: MemoryRouter });
  expect(screen.getByRole("link", { name: /Abandoned/i })).toHaveAttribute("href", "/rounds/3/summary");
});

it("links to backlog entry", () => {
  mockedUseRounds.mockReturnValue({ data: [], isLoading: false, error: null } as unknown as ReturnType<typeof useRounds>);
  render(<RoundHistory />, { wrapper: MemoryRouter });
  expect(screen.getByRole("link", { name: "Enter a past round" })).toHaveAttribute("href", "/rounds/new");
});
```

Use `roundFixture` in this file (replace the existing `rounds` array so `tsc` stays happy if Task 2 already did).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/routes/Dashboard.test.tsx src/routes/RoundHistory.test.tsx`

Expected: FAIL — Dashboard has no Index; RoundHistory has no Abandoned / backlog link.

- [ ] **Step 3: Implement**

`Dashboard.tsx`: above "Stock yardages", a section with `h2` `Handicap Index`, the Index number (`—` if null), the unofficial sentence, a `Link` named `Handicap` to `/handicap`, and `<Sparkline values={scoreValues} />` where `scoreValues` is `[...trends.rounds].reverse().map(r => r.score)` (only include rounds that have a score — they all do on `RoundStats`). Keep the existing club list.

`Layout.tsx` `links` array, after Gapping:

```typescript
  { to: "/handicap", label: "Handicap" },
```

`RoundHistory.tsx`: `const isLive = round.status === "in_progress"`. Everything else (including `abandoned`) goes to `/rounds/${id}/summary`. Show `Abandoned` in the status slot for that status. Add `Link` `Enter a past round` to `/rounds/new` next to `Start a round`.

- [ ] **Step 4: Run tests and type-check**

Run: `cd frontend && npx vitest run src/routes/Dashboard.test.tsx src/routes/RoundHistory.test.tsx && npx tsc -b --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/Dashboard.tsx frontend/src/routes/Dashboard.test.tsx frontend/src/components/Layout.tsx frontend/src/routes/RoundHistory.tsx frontend/src/routes/RoundHistory.test.tsx
git commit -m "Surface the Index on the dashboard and in nav"
```

---

### Task 10: Verify the slice and mark the docs done

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-scores-stats-handicap-design.md` (decision log)
- Modify: `docs/superpowers/plans/2026-09-08-frontend-scores-stats-handicap.md` (this file — STATUS banner)
- Modify: `docs/superpowers/README.md`
- Modify: `CLAUDE.md`
- Modify: `README.md`

**Interfaces:** none — verification + docs.

- [ ] **Step 1: Full frontend suite + type-check + lint**

```bash
cd frontend
npx vitest run
npx tsc -b --noEmit
npm run lint
npm run build
```

Expected: all tests green (Pillar 1 + 2 plus every test this plan added), `tsc` clean, oxlint clean, production build succeeds.

- [ ] **Step 2: Backend still green**

```bash
cd backend && .venv/bin/pytest -q
```

Expected: existing suite plus Task 1's tests PASS.

- [ ] **Step 3: Manual smoke against the real backend**

```bash
# terminal 1
cd backend && .venv/bin/uvicorn app.main:app --reload
# terminal 2
cd frontend && npm run dev
```

Walk once at `http://localhost:5173`:

1. Open a course → Set up tees → add a tee, save 18-hole rating (e.g. 71.2 / 132 / 72), save a permutation of stroke indexes.
2. Start a 18-hole round from that tee → on hole 1 save strokes + putts + fairway hit → next hole → Finish (or abandon after one hole if you don't want 18).
3. Scorecard shows the stat strip.
4. Enter a past round via Rounds → Enter a past round (under a minute: date, tee, scores, Save).
5. Handicap: unofficial disclaimer visible; either Index or "N more rounds"; table lists the rounds just entered.
6. Dashboard shows the same Index and links to `/handicap`.

Record in the task report which steps were live vs. only covered by tests.

- [ ] **Step 4: Update docs**

Append to the Pillar 3 spec decision log:

```
- 2026-09-08 — Plan 3b (frontend). Two backend seams were required and are in this slice: `HoleOut.stroke_index` so the stroke-index grid round-trips, and `GET /courses/library` listing imported courses because `GET /courses?search=` only queries Overpass. Index trend uses an inline SVG sparkline (no chart library). The unofficial-Index sentence is on the Handicap screen and the Dashboard.
```

In `docs/superpowers/README.md`, change the Pillar 3 frontend line from "Plan 3b — not yet written" to the spec + this plan, both complete.

In `CLAUDE.md`: add `GET /courses/library` to the Courses line; add frontend routes `TeeSetup`, `RoundEntry`, `Handicap`; Status: Pillar 3 frontend complete; Next: Pillar 4.

In `README.md` Status/Roadmap: scores/handicap/round stats are in, not "later".

Banner at the top of **this** plan (below the title, above the agentic-workers line):

```
> **✅ STATUS: COMPLETE (verified YYYY-MM-DD).** All 10 tasks done. Frontend suite green
> (**N tests**), `tsc -b --noEmit` clean, `npm run build` succeeds. Backend suite still
> green including the two seam tests. Record what the live smoke covered.
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-03-scores-stats-handicap-design.md docs/superpowers/plans/2026-09-08-frontend-scores-stats-handicap.md docs/superpowers/README.md CLAUDE.md README.md
git commit -m "Mark the Pillar 3 frontend slice complete"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| §5 Course rating setup (tee, rating/slope/par, stroke-index permutation, par-sum) | 3, 4 |
| §5 Backlog, score-only and full detail, under a minute, explicit date | 7 |
| §6 Tees/ratings/stroke-index API | 2, 3 |
| §6 `POST /rounds` backlog + tee/hole_count/nine | 4, 7 |
| §6 `PATCH` hole putts/fairway/penalties | 5, 6 |
| §6 `GET /rounds/{id}/stats` | 6 |
| §6 `GET /stats/handicap` | 8, 9 |
| §6 `GET /stats/rounds` | 9 |
| §8 TeeSetup | 3 |
| §8 RoundEntry | 7 |
| §8 Handicap (Index, last 20, counting 8, Low Index, cap, trend) | 8 |
| §8 RoundSummary stat strip + hole detail | 6 |
| §8 LiveRound one-tap putts/fairway | 5 |
| §8 Dashboard Index + recent-form line | 9 |
| §9 Unofficial Index copy | 8, 9 |
| §9 9-hole named reason (display, not compute) | 6, 8 |
| HoleOut.stroke_index / course library (seams, not in §6) | 1 — logged in spec decision log |

Out of scope (no task): Pillar 4, PCC, launch-monitor CSV, scoring-history import, sand saves, posting to an authority, charting library.
