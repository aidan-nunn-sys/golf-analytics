import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CourseDetail } from "./CourseDetail";
import { useCourse, useRounds, useCreateRound } from "../api/hooks";
import type { Course, Round } from "../api/types";

vi.mock("../api/hooks", () => ({
  useCourse: vi.fn(),
  useRounds: vi.fn(),
  useCreateRound: vi.fn(),
}));

const mockedUseCourse = vi.mocked(useCourse);
const mockedUseRounds = vi.mocked(useRounds);
const mockedUseCreateRound = vi.mocked(useCreateRound);

const course: Course = {
  id: 7, name: "Pebble Beach", osm_id: "way/1", import_source: "osm",
  location_lat: 36.5, location_lng: -121.9, imported_at: "2026-07-19T00:00:00Z",
  holes: [{ id: 1, course_id: 7, number: 1, par: 4, green_lat: 36.51, green_lng: -121.91, hazards: null }],
};

function renderAt(rounds: Round[]) {
  const create = { mutate: vi.fn() };
  mockedUseCourse.mockReturnValue({ data: course, isLoading: false, error: null } as unknown as ReturnType<typeof useCourse>);
  mockedUseRounds.mockReturnValue({ data: rounds, isLoading: false, error: null } as unknown as ReturnType<typeof useRounds>);
  mockedUseCreateRound.mockReturnValue(create as unknown as ReturnType<typeof useCreateRound>);
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
    expect(create.mutate).toHaveBeenCalledWith({ course_id: 7 }, expect.objectContaining({ onSuccess: expect.any(Function) }));
  });

  it("offers Resume round when an in-progress round exists on this course", () => {
    renderAt([{ id: 9, course_id: 7, date: "2026-07-19", status: "in_progress", current_hole: 3, holes: [] }]);
    expect(screen.getByRole("link", { name: "Resume round" })).toHaveAttribute("href", "/rounds/9");
    expect(screen.queryByRole("button", { name: "Start round" })).not.toBeInTheDocument();
  });
});
