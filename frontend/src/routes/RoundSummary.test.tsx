import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RoundSummary } from "./RoundSummary";
import { useRound, useCourse, useRoundStats, useUpdateRoundHole } from "../api/hooks";
import type { Round, RoundStats } from "../api/types";
import { courseFixture, roundFixture, roundHoleFixture } from "../testFixtures";

vi.mock("../api/hooks", () => ({
  useRound: vi.fn(),
  useCourse: vi.fn(),
  useRoundStats: vi.fn(),
  useUpdateRoundHole: vi.fn(),
}));
const mockedUseRound = vi.mocked(useRound);
const mockedUseCourse = vi.mocked(useCourse);
const mockedUseRoundStats = vi.mocked(useRoundStats);
const mockedUseUpdateRoundHole = vi.mocked(useUpdateRoundHole);

const round = roundFixture({
  status: "completed",
  current_hole: 2,
  holes: [
    roundHoleFixture({ strokes: 5 }),
    roundHoleFixture({ hole_number: 2, par: 3, strokes: 3 }),
  ],
});
const evenParRound = roundFixture({
  id: 6,
  date: "2026-07-20",
  status: "completed",
  current_hole: 2,
  holes: [
    roundHoleFixture({ strokes: 4 }),
    roundHoleFixture({ hole_number: 2, par: 3, strokes: 3 }),
  ],
});
const course = courseFixture({
  osm_id: null,
  location_lat: null,
  location_lng: null,
  imported_at: "",
  holes: [],
});

const stats: RoundStats = {
  score: 8,
  to_par: 1,
  fairways_hit: 0,
  fairways_possible: 1,
  fairway_pct: 0,
  gir: 1,
  gir_pct: 50,
  putts: 3,
  putts_per_gir: 2,
  one_putts: 0,
  three_putts: 0,
  scrambling_pct: null,
  penalties: 0,
  differential: 1.2,
  counts_toward_index: true,
  reason: null,
};

function setup(overrides?: {
  round?: Round | undefined;
  roundIsLoading?: boolean;
  roundError?: unknown;
  stats?: RoundStats;
}) {
  const updateHole = { mutate: vi.fn() };
  mockedUseRound.mockReturnValue({
    data: overrides?.round ?? round,
    isLoading: overrides?.roundIsLoading ?? false,
    error: overrides?.roundError ?? null,
  } as unknown as ReturnType<typeof useRound>);
  mockedUseCourse.mockReturnValue({ data: course, isLoading: false, error: null } as unknown as ReturnType<typeof useCourse>);
  mockedUseRoundStats.mockReturnValue({
    data: overrides?.stats ?? stats,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useRoundStats>);
  mockedUseUpdateRoundHole.mockReturnValue(updateHole as unknown as ReturnType<typeof useUpdateRoundHole>);
  render(
    <MemoryRouter initialEntries={["/rounds/5/summary"]}>
      <Routes>
        <Route path="/rounds/:id/summary" element={<RoundSummary />} />
      </Routes>
    </MemoryRouter>,
  );
  return { updateHole };
}

describe("RoundSummary", () => {
  beforeEach(() => {
    mockedUseRound.mockReset();
    mockedUseCourse.mockReset();
    mockedUseRoundStats.mockReset();
    mockedUseUpdateRoundHole.mockReset();
  });

  it("shows strokes per hole and the running total", () => {
    setup();
    expect(screen.getByText("Pebble Beach")).toBeInTheDocument();
    expect(screen.getByText("Total: 8")).toBeInTheDocument();
  });

  it("shows the result vs. par", () => {
    setup();
    // 8 strokes vs. 7 par = +1
    expect(within(screen.getByText("Total: 8").parentElement!).getByText("+1")).toBeInTheDocument();
  });

  it("shows derived round stats from the server", () => {
    setup();
    expect(screen.getByText("GIR")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Diff")).toBeInTheDocument();
    expect(screen.getByText("1.2")).toBeInTheDocument();
  });

  it("shows the named reason when the round does not count toward the Index", () => {
    setup({
      stats: {
        ...stats,
        counts_toward_index: false,
        differential: null,
        reason: "9-hole rounds do not count toward the Index",
      },
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

  it("patches only the selected fairway result and omits fairway controls on par 3s", async () => {
    const { updateHole } = setup();
    const user = userEvent.setup();
    expect(screen.getAllByRole("button", { name: "Fairway hit" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Fairway miss" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Fairway hit" }));

    expect(updateHole.mutate).toHaveBeenCalledWith(
      { number: 1, fairway_hit: true },
      expect.anything(),
    );
  });

  it("patches penalties for a hole on blur", async () => {
    const { updateHole } = setup();
    const user = userEvent.setup();
    const penalties = screen.getAllByLabelText("Penalties")[0];
    await user.clear(penalties);
    await user.type(penalties, "1");
    await user.tab();

    expect(updateHole.mutate).toHaveBeenCalledWith(
      { number: 1, penalties: 1 },
      expect.anything(),
    );
  });

  it("renders a row for each hole with its par and strokes", () => {
    setup();
    const firstHole = screen.getByText("Hole 1 (Par 4)").closest("li")!;
    const secondHole = screen.getByText("Hole 2 (Par 3)").closest("li")!;
    expect(within(firstHole).getByText("5")).toBeInTheDocument();
    expect(within(secondHole).getByText("3")).toBeInTheDocument();
  });

  it("shows E for an even-par round", () => {
    setup({ round: evenParRound });
    expect(screen.getByText("E")).toBeInTheDocument();
  });

  it("shows a loading state while the round is loading", () => {
    setup({ round: undefined, roundIsLoading: true });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an error state when fetching the round fails", () => {
    setup({ round: undefined, roundError: new Error("Round not found") });
    expect(screen.getByText("Round not found")).toBeInTheDocument();
  });
});
