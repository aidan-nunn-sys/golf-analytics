import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CourseSearch } from "./CourseSearch";
import { useCourseSearch, useImportCourse } from "../api/hooks";
import type { CourseSearchResult } from "../api/types";

vi.mock("../api/hooks", () => ({
  useCourseSearch: vi.fn(),
  useImportCourse: vi.fn(),
}));

const mockedUseCourseSearch = vi.mocked(useCourseSearch);
const mockedUseImportCourse = vi.mocked(useImportCourse);

const results: CourseSearchResult[] = [
  { osm_id: "way/1", name: "Pebble Beach Golf Links", location_lat: 36.5, location_lng: -121.9, hole_count: 18 },
];

function setup(data: CourseSearchResult[] = []) {
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
