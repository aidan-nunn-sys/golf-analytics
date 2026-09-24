import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useDashboard, useHandicap } from "../api/hooks";
import { Dashboard } from "./Dashboard";

vi.mock("../api/hooks", () => ({ useDashboard: vi.fn(), useHandicap: vi.fn() }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ user: { unit_preference: "yards" } }) }));
vi.mock("../components/ScoringTrends", () => ({ ScoringTrends: () => <p>Scoring trends</p> }));
it("surfaces the Index alongside existing scoring trends and yardages", () => {
  vi.mocked(useDashboard).mockReturnValue({ data: { clubs: [], gapping: [] }, isLoading: false, error: null } as unknown as ReturnType<typeof useDashboard>);
  vi.mocked(useHandicap).mockReturnValue({ data: { index: 12.4, low_index: null, cap_applied: null, cap_adjustment: null, rounds_needed: 0, differentials: [] }, isLoading: false, error: null } as unknown as ReturnType<typeof useHandicap>);
  render(<Dashboard />, { wrapper: MemoryRouter });
  expect(screen.getByText("12.4")).toBeInTheDocument();
  expect(screen.getByText(/not an official World Handicap System record/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Handicap Index" })).toHaveAttribute("href", "/handicap");
  expect(screen.getByText("Scoring trends")).toBeInTheDocument(); expect(screen.getByText("Stock yardages")).toBeInTheDocument();
});
