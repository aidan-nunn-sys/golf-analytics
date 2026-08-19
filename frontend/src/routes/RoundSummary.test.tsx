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
