import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { ClubDetail } from "./ClubDetail";
import { useClubStats, useClubs } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import type { ClubStats, Club, User } from "../api/types";

vi.mock("../api/hooks", () => ({
  useClubStats: vi.fn(),
  useClubs: vi.fn(),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: vi.fn(() => ({ id: "1" })),
  };
});

const mockedUseClubStats = vi.mocked(useClubStats);
const mockedUseClubs = vi.mocked(useClubs);
const mockedUseAuth = vi.mocked(useAuth);

const mockStats: ClubStats = {
  count: 25,
  avg_carry: 142.5,
  median_carry: 143.0,
  consistency: 8.5,
  min_carry: 120.0,
  max_carry: 158.0,
  direction: { left: 5, straight: 15, right: 5 },
};

const mockClubs: Club[] = [
  { id: 1, label: "7 Iron", category: "iron", order_index: 0, loft: null, brand_model: null, is_active: true },
];

const mockUser: User = {
  id: 1,
  email: "test@example.com",
  display_name: "Test User",
  unit_preference: "yards",
  is_admin: false,
  created_at: "2024-01-01T00:00:00Z",
};

function setup(stats = mockStats, clubs = mockClubs, user = mockUser) {
  mockedUseClubStats.mockReturnValue({
    data: stats,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useClubStats>);
  mockedUseClubs.mockReturnValue({
    data: clubs,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useClubs>);
  mockedUseAuth.mockReturnValue({ user } as unknown as ReturnType<typeof useAuth>);
}

function renderWithRouter(element: React.ReactElement) {
  return render(<BrowserRouter>{element}</BrowserRouter>);
}

describe("ClubDetail", () => {
  beforeEach(() => {
    mockedUseClubStats.mockReset();
    mockedUseClubs.mockReset();
    mockedUseAuth.mockReset();
    vi.clearAllMocks();
  });

  it("renders stat cards with converted values in yards", () => {
    setup();
    renderWithRouter(<ClubDetail />);

    expect(screen.getByText("Shots")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("Avg carry")).toBeInTheDocument();
    expect(screen.getByText("142.5 yd")).toBeInTheDocument();
    expect(screen.getByText("Median")).toBeInTheDocument();
    expect(screen.getByText("143 yd")).toBeInTheDocument();
    expect(screen.getByText("Consistency (±)")).toBeInTheDocument();
    expect(screen.getByText("8.5 yd")).toBeInTheDocument();
    expect(screen.getByText("Min")).toBeInTheDocument();
    expect(screen.getByText("120 yd")).toBeInTheDocument();
    expect(screen.getByText("Max")).toBeInTheDocument();
    expect(screen.getByText("158 yd")).toBeInTheDocument();
  });

  it("renders direction split line", () => {
    setup();
    renderWithRouter(<ClubDetail />);

    expect(screen.getByText(/Direction — left 5 · straight 15 · right 5/)).toBeInTheDocument();
  });

  it("renders club label from useClubs", () => {
    setup();
    renderWithRouter(<ClubDetail />);

    expect(screen.getByText("7 Iron")).toBeInTheDocument();
  });

  it("shows empty state when stats.count is 0", () => {
    const emptyStats = { ...mockStats, count: 0 };
    setup(emptyStats);
    renderWithRouter(<ClubDetail />);

    expect(screen.getByText("No carry distances logged for this club yet.")).toBeInTheDocument();
  });

  it("shows loading state when isLoading is true", () => {
    mockedUseClubStats.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useClubStats>);
    mockedUseClubs.mockReturnValue({
      data: mockClubs,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useClubs>);
    mockedUseAuth.mockReturnValue({ user: mockUser } as unknown as ReturnType<typeof useAuth>);
    renderWithRouter(<ClubDetail />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows error state when error is present", () => {
    mockedUseClubStats.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load stats"),
    } as unknown as ReturnType<typeof useClubStats>);
    mockedUseClubs.mockReturnValue({
      data: mockClubs,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useClubs>);
    mockedUseAuth.mockReturnValue({ user: mockUser } as unknown as ReturnType<typeof useAuth>);
    renderWithRouter(<ClubDetail />);

    expect(screen.getByText("Failed to load stats")).toBeInTheDocument();
  });

  it("converts stats to meters when unit_preference is meters", () => {
    const userWithMeters = { ...mockUser, unit_preference: "meters" };
    mockedUseClubStats.mockReturnValue({
      data: mockStats,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useClubStats>);
    mockedUseClubs.mockReturnValue({
      data: mockClubs,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useClubs>);
    mockedUseAuth.mockReturnValue({ user: userWithMeters } as unknown as ReturnType<typeof useAuth>);
    renderWithRouter(<ClubDetail />);

    expect(screen.getByText("Avg carry")).toBeInTheDocument();
    const meters = screen.getByText("130.3 m");
    expect(meters).toBeInTheDocument();
  });
});

it("switches to independent total measurements and converts them to meters", () => {
  setup({ ...mockStats, total: { count: 2, average: 200, median: 201, consistency: 10, minimum: 190, maximum: 210, direction: { left: 1, straight: 0, right: 1 } } }, mockClubs, { ...mockUser, unit_preference: "meters" });
  renderWithRouter(<ClubDetail />);
  fireEvent.click(screen.getByRole("button", { name: "Total" }));
  expect(screen.getByText("Avg total")).toBeInTheDocument();
  expect(screen.getByText("182.9 m")).toBeInTheDocument();
  expect(screen.getByText(/Direction — left 1 · straight 0 · right 1/)).toBeInTheDocument();
  expect(screen.queryByText("Avg carry")).not.toBeInTheDocument();
});

it("keeps the selector usable when a GPS-only club has no carry distances", () => {
  setup({ ...mockStats, count: 0, avg_carry: null, total: { count: 1, average: 200, median: 200, consistency: 0, minimum: 200, maximum: 200, direction: { left: 0, straight: 1, right: 0 } } });
  renderWithRouter(<ClubDetail />);
  expect(screen.getByText("No carry distances logged for this club yet.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Total" }));
  expect(screen.getByText("Avg total")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Carry" }));
  expect(screen.getByText("No carry distances logged for this club yet.")).toBeInTheDocument();
});
