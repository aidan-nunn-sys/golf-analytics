✅ STATUS: COMPLETE (verified 2026-07-06)

All 13 tasks built and verified:
- Frontend: 58 tests passing (Vitest + RTL, 13 files), `tsc -b --noEmit` clean.
- Backend: 32 tests passing, all routes moved under `/api` (Task 13), including a
  fix to `tests/conftest.py` so `dependency_overrides` also apply to the `api`
  sub-app FastAPI mounts at `/api` (mounting creates a separate app instance
  with its own override dict — not called out in the Task 13 brief).
- Docker: `docker compose up --build` builds the SPA and API into one image
  (`backend/Dockerfile`, multi-stage) and serves both from a single container
  on `:8000` — `/api/health` returns `{"status":"ok"}`, `/` serves the built
  SPA `index.html`, and client-side routes (e.g. `/sessions`) fall back to
  `index.html` on hard refresh.

Post-review hardening (2026-07-06): the SPA fallback route's static-file
lookup resolved the request path without checking it stayed inside the
static root, allowing `../`-style path traversal to escape it — fixed by
resolving the candidate and requiring containment before serving. Added a
root `.dockerignore` (build context is the whole repo since Task 13; without
it, the web build stage's `COPY frontend/ ./` merges the host's
`node_modules` — including native `darwin-arm64` bindings — into the
`npm ci`-installed Linux tree). Both re-verified against a live
Docker/Colima build.

See `docs/superpowers/specs/2026-06-30-frontend-club-shot-analysis-design.md`
decision log for the `/api`-prefix + single-container decision.

---

# Frontend (Pillar 1 — Club & Shot Analysis) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React web client for the existing Golf Analytics API — log range shots and read derived stats (dashboard, bag, club detail, gapping, session history), served single-origin with the API.

**Architecture:** React + Vite + TypeScript SPA in `frontend/`. TanStack Query owns all server state through a single `api/hooks.ts` layer over a typed `api/client.ts` fetch wrapper. Auth is a JWT in `localStorage` via `AuthContext`. Tailwind for styling, React Router for routing. The client always calls `/api/...`: Vite proxies `/api`→`:8000` in dev; in production FastAPI serves the built SPA at `/` and the API under `/api`.

**Tech Stack:** React 18, Vite 5, TypeScript 5, Tailwind CSS 3, TanStack Query 5, React Router 6, Vitest + React Testing Library. Node 20+.

## Global Constraints

- All frontend code under `frontend/`. Run npm commands from `frontend/`.
- **The client talks to `/api`.** Every request path is `/api/<backend-path>` (e.g. `/api/auth/login`). Never hardcode `http://localhost:8000`.
- **Distances are yards over the wire.** Convert to the user's `unit_preference` for display only (`units.ts`); convert input back to yards before writing. Never send meters.
- **Components never call `client.ts` directly** — only through `api/hooks.ts`. `client.ts` is the only module that knows about `fetch` and the token.
- Enum values (must match backend): `direction ∈ {left, straight, right}`, `category ∈ {wood, hybrid, iron, wedge, putter}`.
- Login is `application/x-www-form-urlencoded` with fields `username`, `password`. Everything else is JSON.
- A 401 from any request clears the token and redirects to `/login`.
- TypeScript strict mode on. Prefer small, focused files.

---

### Task 1: Scaffold the Vite + React + TS app with Tailwind, Router, Query, and Vitest

**Files:**
- Create: `frontend/` (via Vite scaffold), then modify `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tailwind.config.js`, `frontend/postcss.config.js`, `frontend/src/index.css`, `frontend/src/test/setup.ts`
- Create: `frontend/src/smoke.test.ts`

**Interfaces:**
- Produces: a running dev server (`npm run dev`) proxying `/api`→`:8000`; a passing test runner (`npm test`); Tailwind directives loaded globally.

- [ ] **Step 1: Scaffold the project**

Run (from repo root): `npm create vite@latest frontend -- --template react-ts`
Then: `cd frontend && npm install`

- [ ] **Step 2: Add runtime and dev dependencies**

Run (from `frontend/`):
```bash
npm install react-router-dom @tanstack/react-query
npm install -D tailwindcss@3 postcss autoprefixer vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 3: Init Tailwind**

Run: `npx tailwindcss init -p`
Then set `frontend/tailwind.config.js` `content`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 4: Load Tailwind + set the test setup file**

Replace `frontend/src/index.css` with:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Create `frontend/src/test/setup.ts`:
```ts
import "@testing-library/jest-dom";
```

- [ ] **Step 5: Configure Vite (proxy + Vitest)**

Replace `frontend/vite.config.ts` with:
```ts
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

- [ ] **Step 6: Add the `test` script**

In `frontend/package.json` `"scripts"`, add: `"test": "vitest run"` and `"test:watch": "vitest"`.

- [ ] **Step 7: Write a smoke test**

Create `frontend/src/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs the test runner", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Verify test runner and dev server**

Run: `npm test`
Expected: 1 passed.
Run: `npm run dev` — confirm it serves at the printed localhost URL, then stop it.

- [ ] **Step 9: Commit**

```bash
git add frontend/
git commit -m "Scaffold React+Vite+TS frontend with Tailwind, Router, Query, Vitest"
```

---

### Task 2: Unit conversion module (`units.ts`) — TDD

**Files:**
- Test: `frontend/src/units.test.ts`
- Create: `frontend/src/units.ts`

**Interfaces:**
- Produces: `type Unit = "yards" | "meters"`; `yardsToDisplay(yards: number, unit: Unit): number` (rounds to 1 dp); `displayToYards(value: number, unit: Unit): number`; `unitLabel(unit: Unit): string` (`"yd"` | `"m"`). 1 yard = 0.9144 meters.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { yardsToDisplay, displayToYards, unitLabel } from "./units";

describe("units", () => {
  it("passes yards through unchanged", () => {
    expect(yardsToDisplay(150, "yards")).toBe(150);
    expect(displayToYards(150, "yards")).toBe(150);
  });

  it("converts yards to meters and back", () => {
    expect(yardsToDisplay(100, "meters")).toBe(91.4);
    // round-trip within a hundredth of a yard
    expect(displayToYards(91.44, "meters")).toBeCloseTo(100, 2);
  });

  it("labels units", () => {
    expect(unitLabel("yards")).toBe("yd");
    expect(unitLabel("meters")).toBe("m");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- units`
Expected: FAIL (cannot find module `./units`).

- [ ] **Step 3: Implement `units.ts`**

```ts
export type Unit = "yards" | "meters";

const YARDS_TO_METERS = 0.9144;

export function yardsToDisplay(yards: number, unit: Unit): number {
  const v = unit === "meters" ? yards * YARDS_TO_METERS : yards;
  return Math.round(v * 10) / 10;
}

export function displayToYards(value: number, unit: Unit): number {
  return unit === "meters" ? value / YARDS_TO_METERS : value;
}

export function unitLabel(unit: Unit): string {
  return unit === "meters" ? "m" : "yd";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- units`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/units.ts frontend/src/units.test.ts
git commit -m "Add yards<->meters display conversion (units.ts)"
```

---

### Task 3: API types + fetch client (`client.ts`) — TDD

**Files:**
- Create: `frontend/src/api/types.ts`
- Test: `frontend/src/api/client.test.ts`
- Create: `frontend/src/api/client.ts`

**Interfaces:**
- Produces types in `types.ts`: `User`, `Club`, `Session`, `Shot`, `ClubStats`, `GapRow`, `Dashboard`, `Direction`, `Category`, `Token` (shapes below).
- Produces in `client.ts`: `class ApiError extends Error { status: number }`; `setToken(t: string | null): void`; `getToken(): string | null`; `apiGet<T>(path): Promise<T>`; `apiSend<T>(method, path, body?): Promise<T>` (JSON); `apiLogin(username, password): Promise<Token>` (form-encoded). All prepend `/api`. On non-2xx, throws `ApiError`. On 401, calls the registered unauthorized handler. `onUnauthorized(fn): void` registers it.

- [ ] **Step 1: Write `types.ts`**

```ts
export type Direction = "left" | "straight" | "right";
export type Category = "wood" | "hybrid" | "iron" | "wedge" | "putter";

export interface User {
  id: number;
  email: string;
  display_name: string;
  is_admin: boolean;
  unit_preference: "yards" | "meters";
  created_at: string;
}

export interface Token { access_token: string; token_type: string; }

export interface Club {
  id: number;
  label: string;
  category: Category;
  order_index: number;
  loft: number | null;
  brand_model: string | null;
  is_active: boolean;
}

export interface Session {
  id: number;
  date: string;
  name: string | null;
  surface: string | null;
  wind: string | null;
  temperature: number | null;
  notes: string | null;
}

export interface Shot {
  id: number;
  session_id: number;
  club_id: number;
  carry_yards: number;
  total_yards: number | null;
  direction: Direction;
  source: string;
  created_at: string;
}

export interface ClubStats {
  count: number;
  avg_carry: number | null;
  median_carry: number | null;
  consistency: number | null;
  min_carry: number | null;
  max_carry: number | null;
  direction: { left: number; straight: number; right: number };
}

export interface GapRow {
  club_id: number;
  label: string;
  avg_carry: number | null;
  gap_to_next: number | null;
}

export interface DashboardClub {
  club_id: number;
  label: string;
  category: Category;
  order_index: number;
  stats: ClubStats;
}

export interface Dashboard { clubs: DashboardClub[]; gapping: GapRow[]; }
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiGet, ApiError, setToken, onUnauthorized } from "./client";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe("client", () => {
  beforeEach(() => setToken(null));

  it("prefixes /api and returns parsed JSON", async () => {
    global.fetch = mockFetch(200, { status: "ok" }) as never;
    const data = await apiGet<{ status: string }>("/health");
    expect(data.status).toBe("ok");
    expect((global.fetch as never as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("/api/health");
  });

  it("throws ApiError on non-2xx", async () => {
    global.fetch = mockFetch(404, { detail: "nope" }) as never;
    await expect(apiGet("/clubs/999/stats")).rejects.toBeInstanceOf(ApiError);
  });

  it("fires the unauthorized handler on 401", async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    global.fetch = mockFetch(401, { detail: "bad" }) as never;
    await expect(apiGet("/auth/me")).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- client`
Expected: FAIL (cannot find module `./client`).

- [ ] **Step 4: Implement `client.ts`**

```ts
import type { Token } from "./types";

const BASE = "/api";
const TOKEN_KEY = "golf.token";

let unauthorizedHandler: () => void = () => {};
export function onUnauthorized(fn: () => void): void {
  unauthorizedHandler = fn;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) unauthorizedHandler();
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  return handle<T>(res);
}

export async function apiSend<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle<T>(res);
}

export async function apiLogin(username: string, password: string): Promise<Token> {
  const form = new URLSearchParams({ username, password });
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  return handle<Token>(res);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- client`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/
git commit -m "Add API types and typed fetch client with ApiError + 401 hook"
```

---

### Task 4: Auth context, route guard, Login screen, and app shell

**Files:**
- Create: `frontend/src/auth/AuthContext.tsx`
- Create: `frontend/src/auth/RequireAuth.tsx`
- Create: `frontend/src/components/Layout.tsx`
- Create: `frontend/src/components/AsyncBoundary.tsx`
- Create: `frontend/src/routes/Login.tsx`
- Replace: `frontend/src/App.tsx`
- Replace: `frontend/src/main.tsx`

**Interfaces:**
- Consumes: `apiLogin`, `apiGet`, `setToken`, `getToken`, `onUnauthorized`, `ApiError`, `User`.
- Produces: `useAuth(): { user: User | null; loading: boolean; login(email, pw): Promise<void>; logout(): void }`; `<RequireAuth>` guard; `<Layout>` nav shell; `<AsyncBoundary loading error isEmpty emptyText>` wrapper; `<Login>` screen; the router with all routes registered (screens added in later tasks render placeholders for now).

- [ ] **Step 1: Write `AuthContext.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiGet, apiLogin, getToken, onUnauthorized, setToken } from "../api/client";
import type { User } from "../api/types";

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  function logout() {
    setToken(null);
    setUser(null);
  }

  useEffect(() => {
    onUnauthorized(logout);
    if (!getToken()) {
      setLoading(false);
      return;
    }
    apiGet<User>("/auth/me")
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const token = await apiLogin(email, password);
    setToken(token.access_token);
    setUser(await apiGet<User>("/auth/me"));
  }

  return <AuthCtx.Provider value={{ user, loading, login, logout }}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

- [ ] **Step 2: Write `RequireAuth.tsx`**

```tsx
import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 3: Write `AsyncBoundary.tsx`**

```tsx
import type { ReactNode } from "react";

export function AsyncBoundary({
  loading,
  error,
  isEmpty,
  emptyText = "Nothing here yet.",
  children,
}: {
  loading: boolean;
  error: unknown;
  isEmpty?: boolean;
  emptyText?: string;
  children: ReactNode;
}) {
  if (loading) return <div className="p-4 text-gray-500">Loading…</div>;
  if (error) return <div className="p-4 text-red-600">{(error as Error).message}</div>;
  if (isEmpty) return <div className="p-4 text-gray-500">{emptyText}</div>;
  return <>{children}</>;
}
```

- [ ] **Step 4: Write `Layout.tsx`**

```tsx
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const links = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/log", label: "Log" },
  { to: "/bag", label: "Bag" },
  { to: "/gapping", label: "Gapping" },
  { to: "/sessions", label: "Sessions" },
  { to: "/settings", label: "Settings" },
];

export function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex items-center gap-4 border-b bg-white px-4 py-3 text-sm">
        <span className="font-semibold">⛳ Golf</span>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) => (isActive ? "text-green-700 font-medium" : "text-gray-600")}
          >
            {l.label}
          </NavLink>
        ))}
        <button onClick={logout} className="ml-auto text-gray-500 hover:text-gray-800">
          {user?.display_name || user?.email} · Sign out
        </button>
      </nav>
      <main className="mx-auto max-w-3xl p-4">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Write `Login.tsx`**

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate("/");
    } catch {
      setError("Incorrect email or password");
    }
  }

  return (
    <div className="mx-auto mt-24 max-w-sm rounded border bg-white p-6">
      <h1 className="mb-4 text-lg font-semibold">Sign in</h1>
      <form onSubmit={submit} className="space-y-3">
        <input className="w-full rounded border p-2" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} autoFocus />
        <input className="w-full rounded border p-2" type="password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="w-full rounded bg-green-700 p-2 text-white" type="submit">Sign in</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 6: Write `App.tsx`** (routes; later tasks replace the inline placeholders with real screens)

```tsx
import { Routes, Route } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { Layout } from "./components/Layout";
import { Login } from "./routes/Login";

function Placeholder({ name }: { name: string }) {
  return <div className="text-gray-500">{name} — coming soon.</div>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Placeholder name="Dashboard" />} />
        <Route path="log" element={<Placeholder name="Log" />} />
        <Route path="bag" element={<Placeholder name="Bag" />} />
        <Route path="clubs/:id" element={<Placeholder name="Club detail" />} />
        <Route path="gapping" element={<Placeholder name="Gapping" />} />
        <Route path="sessions" element={<Placeholder name="Sessions" />} />
        <Route path="settings" element={<Placeholder name="Settings" />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 7: Write `main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth/AuthContext";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 8: Verify against the running backend**

Start the backend (`cd backend && .venv/bin/uvicorn app.main:app --reload`). In `frontend/`, `npm run dev`, open the app, log in with the admin credentials. Expected: redirect to Dashboard placeholder; nav shows email + Sign out; refresh keeps you logged in; Sign out returns to `/login`.

- [ ] **Step 9: Commit**

```bash
git add frontend/src
git commit -m "Add auth context, route guard, login, and app shell"
```

---

### Task 5: Query hooks layer (`api/hooks.ts`)

**Files:**
- Create: `frontend/src/api/hooks.ts`
- Test: `frontend/src/api/hooks.test.tsx`

**Interfaces:**
- Consumes: `apiGet`, `apiSend`, and all types.
- Produces query hooks: `useClubs()`, `useSessions()`, `useSessionShots(sessionId)`, `useClubStats(clubId)`, `useGapping()`, `useDashboard()`, `useMe()`.
- Produces mutation hooks (each invalidates the affected keys): `useCreateClub()`, `useUpdateClub()`, `useDeleteClub()`, `useCreateSession()`, `useLogShot(sessionId)`, `useUpdateShot(sessionId)`, `useDeleteShot(sessionId)`, `useUpdateMe()`.
- Query key convention: `["clubs"]`, `["sessions"]`, `["shots", sessionId]`, `["clubStats", clubId]`, `["gapping"]`, `["dashboard"]`, `["me"]`.

- [ ] **Step 1: Write `hooks.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "./client";
import type { Club, Dashboard, GapRow, Session, Shot, ClubStats, User } from "./types";

export const keys = {
  clubs: ["clubs"] as const,
  sessions: ["sessions"] as const,
  shots: (id: number) => ["shots", id] as const,
  clubStats: (id: number) => ["clubStats", id] as const,
  gapping: ["gapping"] as const,
  dashboard: ["dashboard"] as const,
  me: ["me"] as const,
};

// Queries
export const useClubs = () => useQuery({ queryKey: keys.clubs, queryFn: () => apiGet<Club[]>("/clubs") });
export const useSessions = () => useQuery({ queryKey: keys.sessions, queryFn: () => apiGet<Session[]>("/sessions") });
export const useSessionShots = (sessionId: number | null) =>
  useQuery({
    queryKey: sessionId ? keys.shots(sessionId) : ["shots", "none"],
    queryFn: () => apiGet<Shot[]>(`/sessions/${sessionId}/shots`),
    enabled: sessionId != null,
  });
export const useClubStats = (clubId: number) =>
  useQuery({ queryKey: keys.clubStats(clubId), queryFn: () => apiGet<ClubStats>(`/clubs/${clubId}/stats`) });
export const useGapping = () => useQuery({ queryKey: keys.gapping, queryFn: () => apiGet<GapRow[]>("/stats/gapping") });
export const useDashboard = () => useQuery({ queryKey: keys.dashboard, queryFn: () => apiGet<Dashboard>("/stats/dashboard") });
export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => apiGet<User>("/auth/me") });

// Mutations — invalidate stats-bearing queries after any change that affects them.
function useStatsInvalidation() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: keys.dashboard });
    qc.invalidateQueries({ queryKey: keys.gapping });
  };
}

export function useCreateClub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Club>) => apiSend<Club>("POST", "/clubs", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.clubs }),
  });
}
export function useUpdateClub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Club> }) => apiSend<Club>("PATCH", `/clubs/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.clubs }),
  });
}
export function useDeleteClub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiSend<void>("DELETE", `/clubs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.clubs }),
  });
}
export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Session>) => apiSend<Session>("POST", "/sessions", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.sessions }),
  });
}
export function useLogShot(sessionId: number) {
  const qc = useQueryClient();
  const invalidateStats = useStatsInvalidation();
  return useMutation({
    mutationFn: (body: { club_id: number; carry_yards: number; direction: string }) =>
      apiSend<Shot>("POST", `/sessions/${sessionId}/shots`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.shots(sessionId) });
      invalidateStats();
    },
  });
}
export function useUpdateShot(sessionId: number) {
  const qc = useQueryClient();
  const invalidateStats = useStatsInvalidation();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Shot> }) => apiSend<Shot>("PATCH", `/shots/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.shots(sessionId) });
      invalidateStats();
    },
  });
}
export function useDeleteShot(sessionId: number) {
  const qc = useQueryClient();
  const invalidateStats = useStatsInvalidation();
  return useMutation({
    mutationFn: (id: number) => apiSend<void>("DELETE", `/shots/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.shots(sessionId) });
      invalidateStats();
    },
  });
}
export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { display_name?: string; unit_preference?: string }) => apiSend<User>("PATCH", "/auth/me", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}
```

- [ ] **Step 2: Write a smoke test that a query hook fetches through the client**

`frontend/src/api/hooks.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useClubs } from "./hooks";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useClubs", () => {
  beforeEach(() => localStorage.clear());
  it("fetches the bag from /api/clubs", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve([{ id: 1, label: "Driver" }]),
    }) as never;
    const { result } = renderHook(() => useClubs(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].label).toBe("Driver");
    expect((global.fetch as never as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("/api/clubs");
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- hooks`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/hooks.ts frontend/src/api/hooks.test.tsx
git commit -m "Add TanStack Query hooks for all API resources"
```

---

### Task 6: Dashboard screen (landing)

**Files:**
- Create: `frontend/src/components/StatCard.tsx`
- Create: `frontend/src/routes/Dashboard.tsx`
- Modify: `frontend/src/App.tsx` (swap the Dashboard placeholder for the real screen)

**Interfaces:**
- Consumes: `useDashboard`, `useAuth` (for `unit_preference`), `yardsToDisplay`, `unitLabel`.
- Produces: `<Dashboard>` showing each club's avg carry (stock yardage) + shot count, sorted by `order_index`.

- [ ] **Step 1: Write `StatCard.tsx`**

```tsx
export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-white p-3">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: Write `Dashboard.tsx`**

```tsx
import { Link } from "react-router-dom";
import { useDashboard } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { yardsToDisplay, unitLabel } from "../units";

export function Dashboard() {
  const { data, isLoading, error } = useDashboard();
  const { user } = useAuth();
  const unit = user?.unit_preference ?? "yards";

  return (
    <AsyncBoundary loading={isLoading} error={error}>
      <h1 className="mb-4 text-xl font-semibold">Stock yardages</h1>
      <div className="space-y-1">
        {data?.clubs.map((c) => (
          <Link
            key={c.club_id}
            to={`/clubs/${c.club_id}`}
            className="flex items-center justify-between rounded border bg-white px-3 py-2 hover:bg-gray-50"
          >
            <span>{c.label}</span>
            <span className="text-gray-700">
              {c.stats.avg_carry == null
                ? "—"
                : `${yardsToDisplay(c.stats.avg_carry, unit)} ${unitLabel(unit)}`}
              <span className="ml-2 text-xs text-gray-400">({c.stats.count})</span>
            </span>
          </Link>
        ))}
      </div>
    </AsyncBoundary>
  );
}
```

- [ ] **Step 3: Wire the route**

In `App.tsx`, add `import { Dashboard } from "./routes/Dashboard";` and change `<Route index element={<Placeholder name="Dashboard" />} />` to `<Route index element={<Dashboard />} />`.

- [ ] **Step 4: Verify**

With backend running and shots logged (or empty), `npm run dev` and open `/`. Expected: club list with avg carries (or `—` when no shots), counts in parens, each row links to the club detail route.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "Add Dashboard screen (stock yardages)"
```

---

### Task 7: My Bag screen (club CRUD)

**Files:**
- Create: `frontend/src/routes/Bag.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useClubs`, `useCreateClub`, `useUpdateClub`, `useDeleteClub`.
- Produces: `<Bag>` — list clubs ordered by `order_index`; add a club (label + category); rename (inline edit of label); toggle `is_active`; delete.

- [ ] **Step 1: Write `Bag.tsx`**

```tsx
import { useState } from "react";
import { useClubs, useCreateClub, useDeleteClub, useUpdateClub } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";
import type { Category } from "../api/types";

const CATEGORIES: Category[] = ["wood", "hybrid", "iron", "wedge", "putter"];

export function Bag() {
  const { data: clubs, isLoading, error } = useClubs();
  const create = useCreateClub();
  const update = useUpdateClub();
  const del = useDeleteClub();
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<Category>("iron");

  return (
    <AsyncBoundary loading={isLoading} error={error}>
      <h1 className="mb-4 text-xl font-semibold">My Bag</h1>

      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          create.mutate({ label, category, order_index: (clubs?.length ?? 0) });
          setLabel("");
        }}
      >
        <input className="flex-1 rounded border p-2" placeholder="Club label (e.g. 7 Iron)" value={label}
          onChange={(e) => setLabel(e.target.value)} />
        <select className="rounded border p-2" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="rounded bg-green-700 px-3 text-white" type="submit">Add</button>
      </form>

      <div className="space-y-1">
        {clubs?.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded border bg-white px-3 py-2">
            <input
              className={`flex-1 bg-transparent ${c.is_active ? "" : "text-gray-400 line-through"}`}
              defaultValue={c.label}
              onBlur={(e) => e.target.value !== c.label && update.mutate({ id: c.id, body: { label: e.target.value } })}
            />
            <span className="text-xs text-gray-400">{c.category}</span>
            <button className="text-xs text-gray-500" onClick={() => update.mutate({ id: c.id, body: { is_active: !c.is_active } })}>
              {c.is_active ? "Deactivate" : "Activate"}
            </button>
            <button className="text-xs text-red-600" onClick={() => del.mutate(c.id)}>Delete</button>
          </div>
        ))}
      </div>
    </AsyncBoundary>
  );
}
```

- [ ] **Step 2: Wire the route**

In `App.tsx`: `import { Bag } from "./routes/Bag";` and set `<Route path="bag" element={<Bag />} />`.

- [ ] **Step 3: Verify**

Open `/bag`. Expected: the seeded standard bag lists; adding a club appends it; editing a label and blurring persists it; deactivate strikes it through; delete removes it.

- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "Add My Bag screen (club CRUD)"
```

---

### Task 8: Log entry screen — TDD the shot form (priority screen)

**Files:**
- Create: `frontend/src/routes/LogEntry.tsx`
- Test: `frontend/src/routes/LogEntry.test.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useSessions`, `useCreateSession`, `useClubs`, `useSessionShots`, `useLogShot`, `useDeleteShot`, `useAuth`, `yardsToDisplay`, `displayToYards`, `unitLabel`.
- Produces: `<LogEntry>` — pick/create a session, then a fast add-shot form (club select, carry number, L/S/R toggle defaulting to `straight`), plus an editable list of the session's shots. On Add, the carry field clears and refocuses.

Behavior under test: adding a shot calls `useLogShot` with the selected club, the carry converted to yards, and `direction` defaulting to `straight`; the carry input clears afterward.

- [ ] **Step 1: Write `LogEntry.tsx`**

```tsx
import { useRef, useState } from "react";
import { useClubs, useCreateSession, useDeleteShot, useLogShot, useSessions, useSessionShots } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { displayToYards, yardsToDisplay, unitLabel } from "../units";
import type { Direction } from "../api/types";

const DIRECTIONS: Direction[] = ["left", "straight", "right"];

export function LogEntry() {
  const { user } = useAuth();
  const unit = user?.unit_preference ?? "yards";
  const { data: sessions, isLoading, error } = useSessions();
  const { data: clubs } = useClubs();
  const createSession = useCreateSession();

  const [sessionId, setSessionId] = useState<number | null>(null);
  const activeSession = sessionId ?? sessions?.[0]?.id ?? null;

  return (
    <AsyncBoundary loading={isLoading} error={error}>
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-xl font-semibold">Log shots</h1>
        <select
          className="ml-auto rounded border p-2"
          value={activeSession ?? ""}
          onChange={(e) => setSessionId(Number(e.target.value))}
        >
          {sessions?.map((s) => (
            <option key={s.id} value={s.id}>{s.date}{s.name ? ` · ${s.name}` : ""}</option>
          ))}
        </select>
        <button
          className="rounded border px-3 py-2"
          onClick={() =>
            createSession.mutate(
              { date: new Date().toISOString().slice(0, 10) },
              { onSuccess: (s) => setSessionId(s.id) },
            )
          }
        >
          + New session
        </button>
      </div>

      {activeSession == null ? (
        <p className="text-gray-500">Start a session to begin logging.</p>
      ) : (
        <ShotEntry sessionId={activeSession} unit={unit} clubs={clubs ?? []} />
      )}
    </AsyncBoundary>
  );
}

function ShotEntry({
  sessionId,
  unit,
  clubs,
}: {
  sessionId: number;
  unit: "yards" | "meters";
  clubs: { id: number; label: string }[];
}) {
  const { data: shots } = useSessionShots(sessionId);
  const logShot = useLogShot(sessionId);
  const delShot = useDeleteShot(sessionId);
  const [clubId, setClubId] = useState<number | "">(clubs[0]?.id ?? "");
  const [carry, setCarry] = useState("");
  const [direction, setDirection] = useState<Direction>("straight");
  const carryRef = useRef<HTMLInputElement>(null);

  function add(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(carry);
    if (!clubId || Number.isNaN(value)) return;
    logShot.mutate({
      club_id: Number(clubId),
      carry_yards: displayToYards(value, unit),
      direction,
    });
    setCarry("");
    carryRef.current?.focus();
  }

  const clubLabel = (id: number) => clubs.find((c) => c.id === id)?.label ?? "?";

  return (
    <>
      <form onSubmit={add} className="mb-4 flex flex-wrap items-center gap-2">
        <select className="rounded border p-2" value={clubId} onChange={(e) => setClubId(Number(e.target.value))}>
          {clubs.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <input
          ref={carryRef}
          className="w-28 rounded border p-2"
          type="number"
          step="0.1"
          placeholder={`Carry (${unitLabel(unit)})`}
          value={carry}
          onChange={(e) => setCarry(e.target.value)}
          aria-label="carry"
        />
        <div className="flex gap-1">
          {DIRECTIONS.map((d) => (
            <button
              type="button"
              key={d}
              aria-pressed={direction === d}
              onClick={() => setDirection(d)}
              className={`rounded border px-2 py-2 text-sm ${direction === d ? "bg-green-700 text-white" : "bg-white"}`}
            >
              {d === "left" ? "◄" : d === "right" ? "►" : "▲"}
            </button>
          ))}
        </div>
        <button className="rounded bg-green-700 px-3 py-2 text-white" type="submit">Add</button>
      </form>

      <ul className="space-y-1">
        {shots?.map((s) => (
          <li key={s.id} className="flex items-center justify-between rounded border bg-white px-3 py-2">
            <span>{clubLabel(s.club_id)}</span>
            <span className="text-gray-700">
              {yardsToDisplay(s.carry_yards, unit)} {unitLabel(unit)} · {s.direction}
            </span>
            <button className="text-xs text-red-600" onClick={() => delShot.mutate(s.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </>
  );
}
```

- [ ] **Step 2: Write the failing test**

`frontend/src/routes/LogEntry.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LogEntry } from "./LogEntry";

// Mock auth (meters user, to prove conversion) and the hooks module.
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: { unit_preference: "yards" }, loading: false }),
}));

const logMutate = vi.fn();
vi.mock("../api/hooks", () => ({
  useSessions: () => ({ data: [{ id: 5, date: "2026-06-30", name: null }], isLoading: false, error: null }),
  useClubs: () => ({ data: [{ id: 1, label: "7 Iron" }] }),
  useCreateSession: () => ({ mutate: vi.fn() }),
  useSessionShots: () => ({ data: [] }),
  useLogShot: () => ({ mutate: logMutate }),
  useDeleteShot: () => ({ mutate: vi.fn() }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("LogEntry add-shot form", () => {
  beforeEach(() => logMutate.mockClear());

  it("logs a shot with the selected club, carry in yards, and direction defaulting to straight", async () => {
    render(<LogEntry />, { wrapper });
    const carry = await screen.findByLabelText("carry");
    await userEvent.type(carry, "150");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(logMutate).toHaveBeenCalledWith({ club_id: 1, carry_yards: 150, direction: "straight" });
    await waitFor(() => expect((carry as HTMLInputElement).value).toBe(""));
  });
});
```

- [ ] **Step 3: Run to verify it fails, then passes**

Run: `npm test -- LogEntry`
Expected: initially FAIL if `LogEntry.tsx` has a bug; once Step 1 is correct, PASS. (Write the test, run it, fix `LogEntry.tsx` until green.)

- [ ] **Step 4: Wire the route**

In `App.tsx`: `import { LogEntry } from "./routes/LogEntry";` and set `<Route path="log" element={<LogEntry />} />`.

- [ ] **Step 5: Verify manually**

Open `/log`. Expected: pick or create a session, select a club, type a carry, pick a direction (defaults to straight ▲), Add — the shot appears in the list and the carry field clears and refocuses. Delete removes a shot.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "Add Log entry screen with tested add-shot form"
```

---

### Task 9: Club detail screen

**Files:**
- Create: `frontend/src/routes/ClubDetail.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useParams`, `useClubStats`, `useClubs`, `useAuth`, `StatCard`, `yardsToDisplay`, `unitLabel`.
- Produces: `<ClubDetail>` — the club's name plus avg/median/consistency/min/max carry (unit-converted) and the direction split.

- [ ] **Step 1: Write `ClubDetail.tsx`**

```tsx
import { useParams } from "react-router-dom";
import { useClubStats, useClubs } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { StatCard } from "../components/StatCard";
import { yardsToDisplay, unitLabel } from "../units";

export function ClubDetail() {
  const { id } = useParams();
  const clubId = Number(id);
  const { data: stats, isLoading, error } = useClubStats(clubId);
  const { data: clubs } = useClubs();
  const { user } = useAuth();
  const unit = user?.unit_preference ?? "yards";
  const label = clubs?.find((c) => c.id === clubId)?.label ?? "Club";
  const fmt = (y: number | null) => (y == null ? "—" : `${yardsToDisplay(y, unit)} ${unitLabel(unit)}`);

  return (
    <AsyncBoundary loading={isLoading} error={error} isEmpty={stats?.count === 0} emptyText="No shots logged for this club yet.">
      <h1 className="mb-4 text-xl font-semibold">{label}</h1>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatCard label="Shots" value={String(stats?.count ?? 0)} />
        <StatCard label="Avg carry" value={fmt(stats?.avg_carry ?? null)} />
        <StatCard label="Median" value={fmt(stats?.median_carry ?? null)} />
        <StatCard label="Consistency (±)" value={fmt(stats?.consistency ?? null)} />
        <StatCard label="Min" value={fmt(stats?.min_carry ?? null)} />
        <StatCard label="Max" value={fmt(stats?.max_carry ?? null)} />
      </div>
      {stats && (
        <p className="mt-4 text-sm text-gray-600">
          Direction — left {stats.direction.left} · straight {stats.direction.straight} · right {stats.direction.right}
        </p>
      )}
    </AsyncBoundary>
  );
}
```

- [ ] **Step 2: Wire the route**

In `App.tsx`: `import { ClubDetail } from "./routes/ClubDetail";` and set `<Route path="clubs/:id" element={<ClubDetail />} />`.

- [ ] **Step 3: Verify**

From the Dashboard, click a club with shots. Expected: stat cards populate (unit-converted); direction split shows; a club with no shots shows the empty message.

- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "Add Club detail stats screen"
```

---

### Task 10: Gapping screen

**Files:**
- Create: `frontend/src/routes/Gapping.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useGapping`, `useAuth`, `yardsToDisplay`, `unitLabel`.
- Produces: `<Gapping>` — clubs ordered longest→shortest by avg carry, each showing avg carry and the gap to the next club, flagging small (<8yd) and large (>20yd) gaps.

- [ ] **Step 1: Write `Gapping.tsx`**

```tsx
import { useGapping } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { yardsToDisplay, unitLabel } from "../units";

export function Gapping() {
  const { data, isLoading, error } = useGapping();
  const { user } = useAuth();
  const unit = user?.unit_preference ?? "yards";

  return (
    <AsyncBoundary loading={isLoading} error={error} isEmpty={data?.length === 0} emptyText="Log some shots to see gapping.">
      <h1 className="mb-4 text-xl font-semibold">Gapping</h1>
      <div className="space-y-1">
        {data?.map((row) => {
          const flag =
            row.gap_to_next == null ? "" : row.gap_to_next < 8 ? "text-amber-600" : row.gap_to_next > 20 ? "text-red-600" : "text-gray-500";
          return (
            <div key={row.club_id} className="flex items-center justify-between rounded border bg-white px-3 py-2">
              <span>{row.label}</span>
              <span className="text-gray-700">
                {row.avg_carry == null ? "—" : `${yardsToDisplay(row.avg_carry, unit)} ${unitLabel(unit)}`}
                {row.gap_to_next != null && (
                  <span className={`ml-3 text-sm ${flag}`}>gap {yardsToDisplay(row.gap_to_next, unit)}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </AsyncBoundary>
  );
}
```

- [ ] **Step 2: Wire the route**

In `App.tsx`: `import { Gapping } from "./routes/Gapping";` and set `<Route path="gapping" element={<Gapping />} />`.

- [ ] **Step 3: Verify**

Open `/gapping`. Expected: clubs with recorded shots ranked by avg carry; gap-to-next shown; small/large gaps colored.

- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "Add Gapping screen"
```

---

### Task 11: Session history screen

**Files:**
- Create: `frontend/src/routes/SessionHistory.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useSessions`, `useSessionShots`, `useClubs`, `useAuth`, `yardsToDisplay`, `unitLabel`.
- Produces: `<SessionHistory>` — list of past sessions (date + name + shot count); expanding one shows its shots.

- [ ] **Step 1: Write `SessionHistory.tsx`**

```tsx
import { useState } from "react";
import { useClubs, useSessions, useSessionShots } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { yardsToDisplay, unitLabel } from "../units";

export function SessionHistory() {
  const { data: sessions, isLoading, error } = useSessions();
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <AsyncBoundary loading={isLoading} error={error} isEmpty={sessions?.length === 0} emptyText="No sessions yet.">
      <h1 className="mb-4 text-xl font-semibold">Session history</h1>
      <div className="space-y-1">
        {sessions?.map((s) => (
          <div key={s.id} className="rounded border bg-white">
            <button className="flex w-full items-center justify-between px-3 py-2 text-left" onClick={() => setOpenId(openId === s.id ? null : s.id)}>
              <span>{s.date}{s.name ? ` · ${s.name}` : ""}</span>
              <span className="text-gray-400">{openId === s.id ? "▲" : "▼"}</span>
            </button>
            {openId === s.id && <SessionShots sessionId={s.id} />}
          </div>
        ))}
      </div>
    </AsyncBoundary>
  );
}

function SessionShots({ sessionId }: { sessionId: number }) {
  const { data: shots } = useSessionShots(sessionId);
  const { data: clubs } = useClubs();
  const { user } = useAuth();
  const unit = user?.unit_preference ?? "yards";
  const label = (id: number) => clubs?.find((c) => c.id === id)?.label ?? "?";

  if (!shots?.length) return <p className="px-3 pb-3 text-sm text-gray-500">No shots in this session.</p>;
  return (
    <ul className="border-t px-3 py-2 text-sm">
      {shots.map((s) => (
        <li key={s.id} className="flex justify-between py-0.5">
          <span>{label(s.club_id)}</span>
          <span className="text-gray-600">{yardsToDisplay(s.carry_yards, unit)} {unitLabel(unit)} · {s.direction}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Wire the route**

In `App.tsx`: `import { SessionHistory } from "./routes/SessionHistory";` and set `<Route path="sessions" element={<SessionHistory />} />`.

- [ ] **Step 3: Verify**

Open `/sessions`. Expected: sessions listed newest first; clicking one expands its shots.

- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "Add Session history screen"
```

---

### Task 12: Settings screen

**Files:**
- Create: `frontend/src/routes/Settings.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useMe`, `useUpdateMe`.
- Produces: `<Settings>` — edit `display_name`; choose `unit_preference` (yards/meters). Saving updates via `PATCH /auth/me`.

- [ ] **Step 1: Write `Settings.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useMe, useUpdateMe } from "../api/hooks";
import { AsyncBoundary } from "../components/AsyncBoundary";

export function Settings() {
  const { data: me, isLoading, error } = useMe();
  const update = useUpdateMe();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<"yards" | "meters">("yards");

  useEffect(() => {
    if (me) {
      setName(me.display_name);
      setUnit(me.unit_preference);
    }
  }, [me]);

  return (
    <AsyncBoundary loading={isLoading} error={error}>
      <h1 className="mb-4 text-xl font-semibold">Settings</h1>
      <form
        className="max-w-sm space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate({ display_name: name, unit_preference: unit });
        }}
      >
        <label className="block text-sm">
          Display name
          <input className="mt-1 w-full rounded border p-2" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-sm">
          Units
          <select className="mt-1 w-full rounded border p-2" value={unit} onChange={(e) => setUnit(e.target.value as "yards" | "meters")}>
            <option value="yards">Yards</option>
            <option value="meters">Meters</option>
          </select>
        </label>
        <button className="rounded bg-green-700 px-3 py-2 text-white" type="submit">Save</button>
        {update.isSuccess && <span className="ml-2 text-sm text-green-700">Saved</span>}
      </form>
    </AsyncBoundary>
  );
}
```

- [ ] **Step 2: Wire the route**

In `App.tsx`: `import { Settings } from "./routes/Settings";` and set `<Route path="settings" element={<Settings />} />`. Remove the now-unused `Placeholder` component.

- [ ] **Step 3: Verify**

Open `/settings`, change units to Meters, Save. Expected: "Saved" appears; other screens now show carries in meters after refetch (e.g. Dashboard).

- [ ] **Step 4: Run the full frontend suite**

Run: `npm test`
Expected: all tests pass (units, client, hooks, LogEntry, smoke).

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "Add Settings screen (display name + unit preference)"
```

---

### Task 13: Single-origin production serving (backend `/api` prefix + SPA static mount + Docker)

**Files:**
- Modify: `backend/app/main.py` (mount routers under `/api`; serve the built SPA)
- Modify: `backend/tests/test_health.py`, `test_auth.py`, `test_clubs.py`, `test_sessions.py`, `test_shots.py`, `test_stats_api.py` (prefix request paths with `/api`)
- Modify: `backend/Dockerfile` (multi-stage: build the SPA, copy into the image)
- Modify: `README.md` (frontend dev + prod notes)

**Interfaces:**
- Produces: API served under `/api/*`; the built SPA served at `/` with a client-route fallback to `index.html`. `docker compose up --build` serves the whole app on `:8000`.

- [ ] **Step 1: Move the API under `/api` and serve the SPA in `main.py`**

Replace `backend/app/main.py` with:
```python
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.database import SessionLocal, create_db_and_tables
from app.routers import admin, auth, clubs, sessions, shots, stats
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

api = FastAPI(title="Golf Analytics API")
api.include_router(auth.router)
api.include_router(admin.router)
api.include_router(clubs.router)
api.include_router(sessions.router)
api.include_router(shots.router)
api.include_router(stats.router)


@api.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.mount("/api", api)

# Serve the built SPA if present (production image). In dev the frontend runs
# under Vite and proxies /api here, so this block is simply skipped.
_STATIC = Path(__file__).resolve().parent / "static"
if _STATIC.is_dir():
    app.mount("/assets", StaticFiles(directory=_STATIC / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str) -> FileResponse:
        # Serve real files if they exist (favicon, etc.); otherwise index.html
        # so client-side routes like /sessions resolve on hard refresh.
        candidate = _STATIC / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_STATIC / "index.html")
```

- [ ] **Step 2: Prefix the backend tests' paths with `/api`**

Run (from `backend/`): prefix every request path in the tests (and the `conftest.py` login fixture) with `/api`. The regex handles both plain and f-string paths (`client.post(f"/sessions/...`):
```bash
cd backend
sed -i '' -E 's#(client\.(get|post|patch|delete)\(f?")/#\1/api/#g' tests/test_*.py tests/conftest.py
```
Then grep to confirm none were missed: `grep -REn 'client\.(get|post|patch|delete)\(f?"/(auth|admin|clubs|sessions|shots|stats|health)' tests/` should return **no** matches (every real path now starts `/api/`). Hand-check that `conftest.py`'s `auth_headers` fixture posts to `/api/auth/login`.

- [ ] **Step 3: Run the backend suite**

Run (from `backend/`): `.venv/bin/pytest -q`
Expected: 32 passed. If any 404s remain, a path was missed — fix it to `/api/...`.

- [ ] **Step 4: Multi-stage Dockerfile that builds and bundles the SPA**

Replace `backend/Dockerfile` with:
```dockerfile
# --- build the SPA ---
FROM node:20-slim AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- python runtime ---
FROM python:3.12-slim
WORKDIR /app
COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install --no-cache-dir .
COPY --from=web /web/dist ./app/static
RUN useradd --create-home appuser && mkdir -p /data && chown appuser:appuser /data
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Note: build context must be the repo root now. In `docker-compose.yml`, change the `api` service `build: ./backend` to:
```yaml
    build:
      context: .
      dockerfile: backend/Dockerfile
```

- [ ] **Step 5: Update `README.md`**

Under a new "Frontend" section, document dev (`cd frontend && npm install && npm run dev` with the backend running) and note that `docker compose up --build` now serves the SPA + API together on `:8000`. Update the "Status" line to include the web client.

- [ ] **Step 6: Verify the full stack in Docker**

Run (from repo root): `docker compose down -v && docker compose up --build -d && sleep 8 && curl -s localhost:8000/api/health`
Expected: `{"status":"ok"}`. Open `http://localhost:8000/` — the SPA loads and login works. Then `docker compose down`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/main.py backend/tests/ backend/Dockerfile docker-compose.yml README.md
git commit -m "Serve SPA single-origin: API under /api + static mount + multi-stage build"
```

- [ ] **Step 8: Mark the plan complete**

Add a `✅ STATUS: COMPLETE (verified YYYY-MM-DD)` banner to the top of this plan summarizing what was verified (frontend tests pass, backend 32 pass with `/api` prefix, Docker serves SPA + API), and append a dated entry to the frontend spec's decision log noting completion.

---

## Notes / roadmap (out of scope for this plan)

- Admin user-management UI (currently via `/docs`).
- Launch-monitor import, GPS shots, on-course/OSM (Pillars 2–4) — each its own spec → plan.
- Club reordering by drag; richer session metadata entry (surface/wind/temp) — deferred until asked.
