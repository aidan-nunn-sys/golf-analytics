import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RoundHistory } from "./RoundHistory";
import { useRounds, useCourse, useRestoreRound } from "../api/hooks";
import type { Round, Course } from "../api/types";
import { courseFixture, roundFixture } from "../testFixtures";

vi.mock("../api/hooks", () => ({ useRounds: vi.fn(), useCourse: vi.fn(), useRestoreRound: vi.fn() }));
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
    expect(screen.getByText("Abandoned", { selector: "p" }).closest("a")).toHaveAttribute("href", "/rounds/3/summary");
  });
  beforeEach(() => {
    mockedUseRounds.mockReset();
    mockedUseCourse.mockReset();
  });

  it("surfaces the in-progress round before completed rounds", () => {
    mockedUseRounds.mockReturnValue({ data: rounds, isLoading: false, error: null } as unknown as ReturnType<typeof useRounds>);
    mockedUseCourse.mockImplementation((id: number) => ({ data: courseFor(id), isLoading: false, error: null }) as unknown as ReturnType<typeof useCourse>);
    render(<RoundHistory />, { wrapper: MemoryRouter });

    const links = screen.getAllByRole("article").map((card) => within(card).getAllByRole("link")[0]);
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


it("filters rounds by status and date and clears the filters", () => {
  mockedUseRounds.mockReturnValue({ data: rounds, isLoading: false, error: null } as ReturnType<typeof useRounds>);
  mockedUseCourse.mockReturnValue({ data: courseFor(7), isLoading: false, error: null } as ReturnType<typeof useCourse>);
  render(<RoundHistory />, { wrapper: MemoryRouter });
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "completed" } });
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.queryByRole("link", { name: /In progress on/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-07-11" } });
  expect(screen.getByText("No rounds match these filters.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getAllByRole("article")).toHaveLength(2);
});

it("opens Trash and restores the selected round without showing edit links", () => {
  const restore = vi.fn();
  vi.mocked(useRestoreRound).mockReturnValue({ mutate: restore, isPending: false, error: null } as unknown as ReturnType<typeof useRestoreRound>);
  mockedUseRounds.mockImplementation((deleted) => ({ data: deleted ? [roundFixture({ id: 4, deleted_at: "2026-09-24T12:00:00Z" })] : rounds, isLoading: false, error: null }) as ReturnType<typeof useRounds>);
  mockedUseCourse.mockReturnValue({ data: courseFor(7), isLoading: false, error: null } as ReturnType<typeof useCourse>);
  render(<RoundHistory />, { wrapper: MemoryRouter });
  fireEvent.click(screen.getByRole("button", { name: "Trash" }));
  expect(mockedUseRounds).toHaveBeenLastCalledWith(true);
  expect(screen.queryByRole("link", { name: "Round details" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Restore round" }));
  expect(restore).toHaveBeenCalledWith(4);
});

it("keeps restore failures visible and allows retry", () => {
  vi.mocked(useRestoreRound).mockReturnValue({ mutate: vi.fn(), isPending: false, error: new Error("Server unavailable") } as unknown as ReturnType<typeof useRestoreRound>);
  mockedUseRounds.mockReturnValue({ data: [roundFixture()], isLoading: false, error: null } as ReturnType<typeof useRounds>);
  mockedUseCourse.mockReturnValue({ data: courseFor(7), isLoading: false, error: null } as ReturnType<typeof useCourse>);
  render(<MemoryRouter initialEntries={["/rounds?view=trash"]}><RoundHistory /></MemoryRouter>);
  expect(screen.getByRole("alert")).toHaveTextContent("Server unavailable");
  expect(screen.getByRole("button", { name: "Restore round" })).toBeEnabled();
});
