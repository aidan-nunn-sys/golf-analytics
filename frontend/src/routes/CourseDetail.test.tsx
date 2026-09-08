import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CourseDetail } from "./CourseDetail";
import { useCourse, useRounds, useCreateRound, useTees } from "../api/hooks";
import type { Round, TeeSet } from "../api/types";
import { courseFixture, holeFixture, roundFixture } from "../testFixtures";

vi.mock("../api/hooks", () => ({
  useCourse: vi.fn(),
  useRounds: vi.fn(),
  useCreateRound: vi.fn(),
  useTees: vi.fn(),
}));

const mockedUseCourse = vi.mocked(useCourse);
const mockedUseRounds = vi.mocked(useRounds);
const mockedUseCreateRound = vi.mocked(useCreateRound);
const mockedUseTees = vi.mocked(useTees);

const course = courseFixture({
  holes: [holeFixture({ green_lat: 36.51, green_lng: -121.91 })],
});

function renderAt(rounds: Round[], tees: TeeSet[] = []) {
  const create = { mutate: vi.fn() };
  mockedUseCourse.mockReturnValue({ data: course, isLoading: false, error: null } as unknown as ReturnType<typeof useCourse>);
  mockedUseRounds.mockReturnValue({ data: rounds, isLoading: false, error: null } as unknown as ReturnType<typeof useRounds>);
  mockedUseCreateRound.mockReturnValue(create as unknown as ReturnType<typeof useCreateRound>);
  mockedUseTees.mockReturnValue({ data: tees, isLoading: false, error: null } as unknown as ReturnType<typeof useTees>);
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
    mockedUseTees.mockReset();
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
    expect(create.mutate).toHaveBeenCalledWith(
      { course_id: 7, tee_set_id: null, hole_count: 18 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("offers Resume round when an in-progress round exists on this course", () => {
    renderAt([roundFixture({ id: 9, current_hole: 3 })]);
    expect(screen.getByRole("link", { name: "Resume round" })).toHaveAttribute("href", "/rounds/9");
    expect(screen.queryByRole("button", { name: "Start round" })).not.toBeInTheDocument();
  });

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
});
