import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RoundHistory } from "./RoundHistory";
import { useRounds, useCourse } from "../api/hooks";
import type { Round, Course } from "../api/types";

vi.mock("../api/hooks", () => ({ useRounds: vi.fn(), useCourse: vi.fn() }));
const mockedUseRounds = vi.mocked(useRounds);
const mockedUseCourse = vi.mocked(useCourse);

const rounds: Round[] = [
  { id: 1, course_id: 7, date: "2026-07-10", status: "completed", current_hole: 18, holes: [] },
  { id: 2, course_id: 7, date: "2026-07-19", status: "in_progress", current_hole: 3, holes: [] },
];

function courseFor(id: number): Course {
  return { id, name: "Pebble Beach", osm_id: null, import_source: "osm", location_lat: null, location_lng: null, imported_at: "", holes: [] };
}

describe("RoundHistory", () => {
  beforeEach(() => {
    mockedUseRounds.mockReset();
    mockedUseCourse.mockReset();
  });

  it("surfaces the in-progress round before completed rounds", () => {
    mockedUseRounds.mockReturnValue({ data: rounds, isLoading: false, error: null } as unknown as ReturnType<typeof useRounds>);
    mockedUseCourse.mockImplementation((id: number) => ({ data: courseFor(id), isLoading: false, error: null }) as unknown as ReturnType<typeof useCourse>);
    render(<RoundHistory />, { wrapper: MemoryRouter });

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/rounds/2");
    expect(links[1]).toHaveAttribute("href", "/rounds/1/summary");
  });

  it("links a completed round to its summary and an in-progress round to live play", () => {
    mockedUseRounds.mockReturnValue({ data: rounds, isLoading: false, error: null } as unknown as ReturnType<typeof useRounds>);
    mockedUseCourse.mockImplementation((id: number) => ({ data: courseFor(id), isLoading: false, error: null }) as unknown as ReturnType<typeof useCourse>);
    render(<RoundHistory />, { wrapper: MemoryRouter });

    expect(screen.getByRole("link", { name: /In progress/ })).toHaveAttribute("href", "/rounds/2");
  });

  it("links to course search to start a new round", () => {
    mockedUseRounds.mockReturnValue({ data: [], isLoading: false, error: null } as unknown as ReturnType<typeof useRounds>);
    render(<RoundHistory />, { wrapper: MemoryRouter });

    expect(screen.getByRole("link", { name: "Start a round" })).toHaveAttribute("href", "/courses");
  });
});
