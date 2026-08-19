import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useClubs, useCourseSearch, useCreateRound, useLogRoundShot } from "./hooks";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
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
