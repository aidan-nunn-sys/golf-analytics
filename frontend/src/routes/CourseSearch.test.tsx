import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CourseSearch } from "./CourseSearch";
import { useCourseSearch, useImportCourse, useCourseLibrary } from "../api/hooks";
import type { CourseSearchResult } from "../api/types";

vi.mock("../api/hooks", () => ({
  useCourseSearch: vi.fn(),
  useCourseLibrary: vi.fn(),
  useImportCourse: vi.fn(),
}));

const mockedUseCourseSearch = vi.mocked(useCourseSearch);
const mockedUseImportCourse = vi.mocked(useImportCourse);

const results: CourseSearchResult[] = [
  { osm_id: "way/1", name: "Pebble Beach Golf Links", location_lat: 36.5, location_lng: -121.9, hole_count: 18 },
];

function setup(data: CourseSearchResult[] = []) {
  vi.mocked(useCourseLibrary).mockReturnValue({ data: [], isLoading: false, error: null } as unknown as ReturnType<typeof useCourseLibrary>);
  const importCourse = { mutate: vi.fn() };
  mockedUseCourseSearch.mockReturnValue(
    { data, isLoading: false, error: null } as unknown as ReturnType<typeof useCourseSearch>,
  );
  mockedUseImportCourse.mockReturnValue(importCourse as unknown as ReturnType<typeof useImportCourse>);
  return { importCourse };
}

describe("CourseSearch", () => {
  beforeEach(() => {
    mockedUseCourseSearch.mockReset();
    mockedUseImportCourse.mockReset();
  });

  it("shows search results with hole count", () => {
    setup(results);
    render(<CourseSearch />, { wrapper: MemoryRouter });

    expect(screen.getByText("Pebble Beach Golf Links")).toBeInTheDocument();
    expect(screen.getByText("18 holes")).toBeInTheDocument();
  });

  it("imports a course on click", async () => {
    const { importCourse } = setup(results);
    const user = userEvent.setup();
    render(<CourseSearch />, { wrapper: MemoryRouter });

    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(importCourse.mutate).toHaveBeenCalledWith(
      { name: "Pebble Beach Golf Links", osm_id: "way/1", location_lat: 36.5, location_lng: -121.9 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("links to manual course entry", () => {
    setup([]);
    render(<CourseSearch />, { wrapper: MemoryRouter });

    expect(screen.getByRole("link", { name: "Add manually" })).toHaveAttribute("href", "/courses/new");
  });
});

it("keeps saved courses available when map search fails", () => {
  setup();
  vi.mocked(useCourseLibrary).mockReturnValue({ data: [{ id: 7, name: "Lonnie Poole Golf Course", osm_id: "way/1" }], isLoading: false, error: null } as unknown as ReturnType<typeof useCourseLibrary>);
  mockedUseCourseSearch.mockReturnValue({ data: undefined, isLoading: false, error: new Error("Map timeout") } as unknown as ReturnType<typeof useCourseSearch>);
  render(<CourseSearch />, { wrapper: MemoryRouter });
  expect(screen.getByRole("link", { name: "Lonnie Poole Golf Course" })).toHaveAttribute("href", "/courses/7");
  expect(screen.getByText("Map timeout")).toBeInTheDocument();
});

it("retries an unchanged search when Search is pressed again", async () => {
  setup();
  const refetch = vi.fn();
  mockedUseCourseSearch.mockReturnValue({ data: [], isLoading: false, isFetching: false, error: null, refetch } as unknown as ReturnType<typeof useCourseSearch>);
  const user = userEvent.setup();
  render(<CourseSearch />, { wrapper: MemoryRouter });
  await user.type(screen.getByRole("textbox", { name: "Course name" }), "  Raleigh Golf Association  ");
  await user.click(screen.getByRole("button", { name: "Search" }));
  expect(mockedUseCourseSearch).toHaveBeenLastCalledWith("Raleigh Golf Association");
  await user.click(screen.getByRole("button", { name: "Search" }));
  expect(refetch).toHaveBeenCalledOnce();
});

it("does not report unknown hole counts as zero", () => {
  setup([{ ...results[0], hole_count: null }]);
  render(<CourseSearch />, { wrapper: MemoryRouter });
  expect(screen.getByText("Hole details loaded on import")).toBeInTheDocument();
  expect(screen.queryByText("0 holes")).not.toBeInTheDocument();
});

it("offers a named manual scorecard when hole import times out", async () => {
  const { importCourse } = setup(results);
  importCourse.mutate.mockImplementation((_body, options) => {
    options.onError(new Error("Map timeout"));
  });
  const user = userEvent.setup();
  render(<CourseSearch />, { wrapper: MemoryRouter });
  await user.click(screen.getByRole("button", { name: "Import" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Map timeout");
  expect(screen.getByRole("link", { name: "Set up this course manually" })).toHaveAttribute("href", "/courses/new?name=Pebble%20Beach%20Golf%20Links");
});
