import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { useRoundTrends } from "../api/hooks";
import type { RoundTrendEntry } from "../api/types";
import { ScoringTrends } from "./ScoringTrends";

vi.mock("../api/hooks", () => ({ useRoundTrends: vi.fn() }));
const mocked = vi.mocked(useRoundTrends);
const round = (overrides: Partial<RoundTrendEntry> = {}): RoundTrendEntry => ({
  round_id: 1, date: "2026-09-22", hole_count: 18, holes_scored: 18,
  putts_recorded: 18, score: 90, to_par: 18, fairways_hit: 7,
  fairways_possible: 14, fairway_pct: 50, gir: 4, gir_pct: 22.2,
  putts: 36, putts_per_gir: 2, one_putts: 0, three_putts: 0,
  scrambling_pct: 0, penalties: 0, differential: null,
  counts_toward_index: false, reason: null, ...overrides,
});
function setup(rounds: RoundTrendEntry[], extra = {}) {
  mocked.mockReturnValue({ data: { rounds, averages: {} }, isLoading: false, error: null, ...extra } as unknown as ReturnType<typeof useRoundTrends>);
  render(<MemoryRouter><ScoringTrends /></MemoryRouter>);
}
beforeEach(() => vi.resetAllMocks());

describe("ScoringTrends", () => {
  it("separates round lengths and excludes incomplete scorecards", async () => {
    setup([round(), round({ round_id: 2, hole_count: 9, holes_scored: 9, putts_recorded: 9, score: 45 }), round({ round_id: 3, holes_scored: 4, score: 20 })]);
    expect(screen.getByText("90.0")).toBeInTheDocument();
    expect(screen.queryByText("20")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "9 holes" }));
    expect(screen.getByText("45.0")).toBeInTheDocument();
    expect(screen.queryByText("90.0")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2026-09-22" })).toHaveAttribute("href", "/rounds/2/summary");
  });
  it("compares the latest five with the previous five in date order", () => {
    setup(Array.from({ length: 10 }, (_, i) => round({ round_id: i + 1, date: `2026-09-${String(i + 1).padStart(2, "0")}`, score: i < 5 ? 95 : 90 })));
    expect(screen.getByText("Average score 5.0 strokes lower than the previous 5 rounds.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "2026-09-01" })).not.toBeInTheDocument();
  });
  it("ties suggestions to recorded evidence and identifies missing putts", () => {
    setup([round({ three_putts: 3, penalties: 2, putts_recorded: 12 })]);
    expect(screen.getByText(/3 three-putt holes across 12/)).toBeInTheDocument();
    expect(screen.getByText(/2 recorded penalty strokes/)).toBeInTheDocument();
    expect(screen.getByText(/Putts recorded on 12 of 18 holes/)).toBeInTheDocument();
    expect(screen.getByText(/comparison appears after 10/)).toBeInTheDocument();
  });
  it("does not suggest a putting problem without recorded three-putts", () => {
    setup([round({ putts_recorded: 0 })]);
    expect(screen.queryByText("Putting distance control:")).not.toBeInTheDocument();
    expect(screen.getByText(/Putts recorded on 0 of 18 holes/)).toBeInTheDocument();
  });
  it("shows an empty state", () => {
    setup([]);
    expect(screen.getByText(/No fully scored 18-hole rounds/)).toBeInTheDocument();
    expect(screen.queryByText("Practice priorities")).not.toBeInTheDocument();
  });
  it("shows loading", () => {
    setup([], { isLoading: true });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
  it("shows request errors", () => {
    setup([], { error: new Error("Unable to load rounds") });
    expect(screen.getByText("Unable to load rounds")).toBeInTheDocument();
  });
});
