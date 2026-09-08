import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useClubs,
  useCourseSearch,
  useCreateRound,
  useUpdateRound,
  useUpdateRoundHole,
  useLogRoundShot,
  useTees,
  useCreateTee,
  useUpsertTeeRating,
  useSetStrokeIndex,
  useCourseLibrary,
  useHandicap,
  useRoundStats,
  useRoundTrends,
  keys,
} from "./hooks";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function wrapperFor(qc: QueryClient) {
  return function TestWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function seedRoundStats(qc: QueryClient) {
  qc.setQueryData(keys.roundStats(5), { score: 72 });
  qc.setQueryData(keys.roundStats(9), { score: 80 });
}

function expectAllRoundStatsInvalidated(qc: QueryClient) {
  expect(qc.getQueryState(keys.roundStats(5))?.isInvalidated).toBe(true);
  expect(qc.getQueryState(keys.roundStats(9))?.isInvalidated).toBe(true);
}

describe("useClubs", () => {
  beforeEach(() => localStorage.clear());
  it("fetches the bag from /api/clubs", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve([{ id: 1, label: "Driver" }]),
    }) as never;
    const { result } = renderHook(() => useClubs(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].label).toBe("Driver");
    expect((globalThis.fetch as never as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("/api/clubs");
  });
});

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
    const qc = new QueryClient();
    seedRoundStats(qc);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 201,
      json: () => Promise.resolve({ id: 5, course_id: 3, date: "2026-07-19", status: "in_progress", current_hole: 1, holes: [] }),
    }) as never;
    const { result } = renderHook(() => useCreateRound(), { wrapper: wrapperFor(qc) });
    result.current.mutate({ course_id: 3 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, opts] = (globalThis.fetch as never as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/rounds");
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({ course_id: 3 });
    expectAllRoundStatsInvalidated(qc);
  });
});

describe("round scoring mutations", () => {
  beforeEach(() => localStorage.clear());

  it("invalidates every round-stats cache after updating a round", async () => {
    const qc = new QueryClient();
    seedRoundStats(qc);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ id: 5, status: "completed" }),
    }) as never;
    const { result } = renderHook(() => useUpdateRound(5), { wrapper: wrapperFor(qc) });

    result.current.mutate({ status: "completed" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectAllRoundStatsInvalidated(qc);
  });

  it("invalidates every round-stats cache after updating a hole", async () => {
    const qc = new QueryClient();
    seedRoundStats(qc);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ id: 5 }),
    }) as never;
    const { result } = renderHook(() => useUpdateRoundHole(5), { wrapper: wrapperFor(qc) });

    result.current.mutate({ number: 1, strokes: 4 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectAllRoundStatsInvalidated(qc);
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
    result.current.mutate({ teeId: 4, courseId: 7, scope: "18", body: { course_rating: 71.2, slope_rating: 132, par: 72 } });
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
