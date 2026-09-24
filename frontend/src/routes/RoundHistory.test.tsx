import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RoundHistory } from "./RoundHistory";
import { useRounds, useCourse } from "../api/hooks";
import type { Round, Course } from "../api/types";
import { courseFixture, roundFixture } from "../testFixtures";

vi.mock("../api/hooks", () => ({ useRounds: vi.fn(), useCourse: vi.fn() }));
const mockedUseRounds = vi.mocked(useRounds);
const mockedUseCourse = vi.mocked(useCourse);

const rounds: Round[] = [
  roundFixture({ id: 1, date: "2026-07-10", status: "completed", current_hole: 18 }),
  roundFixture({ id: 2, current_hole: 3 }),
];

function courseFor(id: number): Course {
  return courseFixture({
    id,
    osm_id: null,
    location_lat: null,
    location_lng: null,
    imported_at: "",
    holes: [],
  });
}

describe("RoundHistory", () => {
  it("links to past-round entry and labels abandoned rounds", () => {
    mockedUseRounds.mockReturnValue({ data: [roundFixture({ id: 3, status: "abandoned" })], isLoading: false, error: null } as ReturnType<typeof useRounds>);
    mockedUseCourse.mockReturnValue({ data: courseFor(7), isLoading: false, error: null } as ReturnType<typeof useCourse>);
    render(<RoundHistory />, { wrapper: MemoryRouter });
    expect(screen.getByRole("link", { name: "Enter a past round" })).toHaveAttribute("href", "/rounds/new");
    expect(screen.getByText("Abandoned").closest("a")).toHaveAttribute("href", "/rounds/3/summary");
  });
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
