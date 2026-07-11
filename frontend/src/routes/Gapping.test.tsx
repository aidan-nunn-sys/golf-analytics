import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { Gapping } from "./Gapping";
import { useGapping } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import type { GapRow, User } from "../api/types";

vi.mock("../api/hooks", () => ({
  useGapping: vi.fn(),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const mockedUseGapping = vi.mocked(useGapping);
const mockedUseAuth = vi.mocked(useAuth);

const mockGappingData: GapRow[] = [
  { club_id: 1, label: "Driver", avg_carry: 280, gap_to_next: 25 },
  { club_id: 2, label: "3 Wood", avg_carry: 255, gap_to_next: 30 },
  { club_id: 3, label: "5 Wood", avg_carry: 225, gap_to_next: 12 },
  { club_id: 4, label: "2 Iron", avg_carry: 213, gap_to_next: 7 },
  { club_id: 5, label: "3 Iron", avg_carry: 206, gap_to_next: 5 },
  { club_id: 6, label: "Putter", avg_carry: null, gap_to_next: null },
];

const mockUser: User = {
  id: 1,
  email: "test@example.com",
  display_name: "Test User",
  unit_preference: "yards",
  is_admin: false,
  created_at: "2024-01-01T00:00:00Z",
};

function setup(data = mockGappingData, user = mockUser) {
  mockedUseGapping.mockReturnValue({
    data,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useGapping>);
  mockedUseAuth.mockReturnValue({ user } as unknown as ReturnType<typeof useAuth>);
}

function renderWithRouter(element: React.ReactElement) {
  return render(<BrowserRouter>{element}</BrowserRouter>);
}

describe("Gapping", () => {
  beforeEach(() => {
    mockedUseGapping.mockReset();
    mockedUseAuth.mockReset();
    vi.clearAllMocks();
  });

  it("renders title", () => {
    setup();
    renderWithRouter(<Gapping />);

    expect(screen.getByText("Gapping")).toBeInTheDocument();
  });

  it("renders clubs ordered longest-to-shortest by avg_carry", () => {
    setup();
    renderWithRouter(<Gapping />);

    const clubLabels = screen.getAllByText(/Driver|3 Wood|5 Wood|2 Iron|3 Iron|Putter/);
    expect(clubLabels.length).toBeGreaterThan(0);

    // Check that Driver (280yd) is rendered before 3 Wood (255yd)
    const driverElement = screen.getByText("Driver");
    const threeWoodElement = screen.getByText("3 Wood");
    expect(driverElement.compareDocumentPosition(threeWoodElement)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it("displays avg_carry with unit conversion for yards", () => {
    setup();
    renderWithRouter(<Gapping />);

    expect(screen.getByText("280 yd")).toBeInTheDocument();
    expect(screen.getByText("255 yd")).toBeInTheDocument();
    expect(screen.getByText("225 yd")).toBeInTheDocument();
  });

  it("displays gap_to_next values with unit conversion", () => {
    setup();
    renderWithRouter(<Gapping />);

    expect(screen.getByText(/gap 25/)).toBeInTheDocument();
    expect(screen.getByText(/gap 30/)).toBeInTheDocument();
    expect(screen.getByText(/gap 12/)).toBeInTheDocument();
  });

  it("flags small gaps (<8yd) with text-amber-600", () => {
    setup();
    renderWithRouter(<Gapping />);

    // 2 Iron has gap_to_next = 7 (< 8)
    const smallGapSpan = screen.getByText(/gap 7/);
    expect(smallGapSpan).toHaveClass("text-amber-600");
  });

  it("flags large gaps (>20yd) with text-red-600", () => {
    setup();
    renderWithRouter(<Gapping />);

    // Driver has gap_to_next = 25 (> 20)
    const largeGapSpan = screen.getByText(/gap 25/);
    expect(largeGapSpan).toHaveClass("text-red-600");

    // 3 Wood has gap_to_next = 30 (> 20)
    const largeGapSpan2 = screen.getByText(/gap 30/);
    expect(largeGapSpan2).toHaveClass("text-red-600");
  });

  it("flags normal gaps (8-20yd) with text-gray-500", () => {
    setup();
    renderWithRouter(<Gapping />);

    // 5 Wood has gap_to_next = 12 (between 8 and 20)
    const normalGapSpan = screen.getByText(/gap 12/);
    expect(normalGapSpan).toHaveClass("text-gray-500");
  });

  it("does not render gap span when gap_to_next is null", () => {
    setup();
    renderWithRouter(<Gapping />);

    // Putter has gap_to_next = null, so no gap span should render
    const putterElement = screen.getByText("Putter");
    // Check that the gap text does not appear next to putter
    const putterRow = putterElement.closest("div");
    expect(putterRow?.textContent).not.toMatch(/gap \d/);
  });

  it("displays dash when avg_carry is null", () => {
    setup();
    renderWithRouter(<Gapping />);

    // Putter has avg_carry = null
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("converts values to meters when unit_preference is meters", () => {
    const userWithMeters = { ...mockUser, unit_preference: "meters" };
    mockedUseGapping.mockReturnValue({
      data: mockGappingData,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useGapping>);
    mockedUseAuth.mockReturnValue({ user: userWithMeters } as unknown as ReturnType<typeof useAuth>);
    renderWithRouter(<Gapping />);

    // Driver: 280 yd * 0.9144 = 256.032 → 256 m (rounded to 1 decimal place)
    expect(screen.getByText("256 m")).toBeInTheDocument();
    // gap 25 yd = 22.86 m → 22.9 m
    expect(screen.getByText(/gap 22.9/)).toBeInTheDocument();
  });

  it("shows empty state when data is empty array", () => {
    mockedUseGapping.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useGapping>);
    mockedUseAuth.mockReturnValue({ user: mockUser } as unknown as ReturnType<typeof useAuth>);
    renderWithRouter(<Gapping />);

    expect(screen.getByText("Log some shots to see gapping.")).toBeInTheDocument();
  });

  it("shows loading state when isLoading is true", () => {
    mockedUseGapping.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useGapping>);
    mockedUseAuth.mockReturnValue({ user: mockUser } as unknown as ReturnType<typeof useAuth>);
    renderWithRouter(<Gapping />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows error state when error is present", () => {
    mockedUseGapping.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load gapping data"),
    } as unknown as ReturnType<typeof useGapping>);
    mockedUseAuth.mockReturnValue({ user: mockUser } as unknown as ReturnType<typeof useAuth>);
    renderWithRouter(<Gapping />);

    expect(screen.getByText("Failed to load gapping data")).toBeInTheDocument();
  });

  it("handles missing user gracefully and defaults to yards", () => {
    mockedUseGapping.mockReturnValue({
      data: [{ club_id: 1, label: "Driver", avg_carry: 280, gap_to_next: 25 }],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useGapping>);
    mockedUseAuth.mockReturnValue({ user: null } as unknown as ReturnType<typeof useAuth>);
    renderWithRouter(<Gapping />);

    expect(screen.getByText("280 yd")).toBeInTheDocument();
  });

  it("3 Iron with 5 yd gap is flagged as amber (< 8)", () => {
    setup();
    renderWithRouter(<Gapping />);

    const smallGapSpan = screen.getByText(/gap 5/);
    expect(smallGapSpan).toHaveClass("text-amber-600");
  });
});
