import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useHandicap } from "../api/hooks";
import type { Handicap as HandicapData } from "../api/types";
import { Handicap } from "./Handicap";

vi.mock("../api/hooks", () => ({ useHandicap: vi.fn() }));
const empty: HandicapData = { index: null, low_index: null, cap_applied: null, cap_adjustment: null, rounds_needed: 3, differentials: [] };
function setup(data = empty, error: Error | null = null, isLoading = false) {
  vi.mocked(useHandicap).mockReturnValue({ data, error, isLoading } as ReturnType<typeof useHandicap>);
  render(<Handicap />, { wrapper: MemoryRouter });
}
describe("Handicap", () => {
  it("explains the unofficial index and how to establish one", () => {
    setup(); expect(screen.getByText(/not an official World Handicap System record/)).toBeInTheDocument();
    expect(screen.getByText(/3 more acceptable rounds/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Enter a past round" })).toHaveAttribute("href", "/rounds/new");
  });
  it("shows caps, counting scores, exclusion reasons, scorecard links and the trend", () => {
    setup({ ...empty, index: 12.4, low_index: 11, cap_applied: "soft", cap_adjustment: 0.4, rounds_needed: 0, differentials: [
      { round_id: 1, date: "2026-06-01", differential: 13.1, counts_toward_index: true, reason: null, is_counting: true, index_after: 13.2 },
      { round_id: 2, date: "2026-06-08", differential: 11.2, counts_toward_index: true, reason: null, is_counting: false, index_after: 12.4 },
      { round_id: 3, date: "2026-06-15", differential: null, counts_toward_index: false, reason: "9-hole rounds do not count toward the Index", is_counting: false, index_after: 12.4 },
    ] });
    expect(screen.getByText("12.4")).toBeInTheDocument(); expect(screen.getByText("11.0")).toBeInTheDocument();
    expect(screen.getByText(/Soft cap applied/)).toHaveTextContent("0.4");
    expect(screen.getByText("Counting")).toBeInTheDocument(); expect(screen.getByText(/9-hole rounds do not count/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2026-06-01" })).toHaveAttribute("href", "/rounds/1/summary");
    expect(screen.getByRole("img", { name: "Handicap Index history" })).toBeInTheDocument();
  });
  it("formats plus handicaps using golf notation", () => {
    setup({ ...empty, index: -1.2, low_index: -2, rounds_needed: 0 });
    expect(screen.getByText("+1.2")).toBeInTheDocument(); expect(screen.getByText("+2.0")).toBeInTheDocument();
  });
  it("shows loading and API errors", () => {
    setup(empty, new Error("Could not load handicap")); expect(screen.getByText("Could not load handicap")).toBeInTheDocument();
  });
});
