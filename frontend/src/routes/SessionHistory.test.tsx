import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { SessionHistory } from "./SessionHistory";
import { useSessions, useSessionShots, useClubs } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import type { Session, Shot, Club, User } from "../api/types";

vi.mock("../api/hooks", () => ({
  useSessions: vi.fn(),
  useSessionShots: vi.fn(),
  useClubs: vi.fn(),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const mockedUseSessions = vi.mocked(useSessions);
const mockedUseSessionShots = vi.mocked(useSessionShots);
const mockedUseClubs = vi.mocked(useClubs);
const mockedUseAuth = vi.mocked(useAuth);

const mockSessions: Session[] = [
  {
    id: 1,
    date: "2024-06-15",
    name: "Morning range",
    surface: null,
    wind: null,
    temperature: null,
    notes: null,
  },
  {
    id: 2,
    date: "2024-06-14",
    name: null,
    surface: null,
    wind: null,
    temperature: null,
    notes: null,
  },
];

const mockShots: Shot[] = [
  {
    id: 101,
    session_id: 1,
    club_id: 1,
    carry_yards: 150.5,
    total_yards: null,
    direction: "straight",
    source: "manual",
    created_at: "2024-06-15T10:05:00Z",
  },
  {
    id: 102,
    session_id: 1,
    club_id: 2,
    carry_yards: 145.0,
    total_yards: null,
    direction: "left",
    source: "manual",
    created_at: "2024-06-15T10:10:00Z",
  },
];

const mockClubs: Club[] = [
  {
    id: 1,
    label: "7 Iron",
    category: "iron",
    order_index: 0,
    loft: null,
    brand_model: null,
    is_active: true,
  },
  {
    id: 2,
    label: "6 Iron",
    category: "iron",
    order_index: 1,
    loft: null,
    brand_model: null,
    is_active: true,
  },
];

const mockUser: User = {
  id: 1,
  email: "test@example.com",
  display_name: "Test User",
  unit_preference: "yards",
  is_admin: false,
  created_at: "2024-01-01T00:00:00Z",
};

function setup(
  sessions = mockSessions,
  shots = mockShots,
  clubs = mockClubs,
  user = mockUser
) {
  mockedUseSessions.mockReturnValue({
    data: sessions,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useSessions>);

  mockedUseSessionShots.mockImplementation((sessionId) => {
    const sessionShots =
      sessionId === 1
        ? shots
        : sessionId === 2
          ? []
          : shots;
    return {
      data: sessionShots,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useSessionShots>;
  });

  mockedUseClubs.mockReturnValue({
    data: clubs,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useClubs>);

  mockedUseAuth.mockReturnValue({
    user,
  } as unknown as ReturnType<typeof useAuth>);
}

function renderWithRouter(element: React.ReactElement) {
  return render(<BrowserRouter>{element}</BrowserRouter>);
}

describe("SessionHistory", () => {
  beforeEach(() => {
    mockedUseSessions.mockReset();
    mockedUseSessionShots.mockReset();
    mockedUseClubs.mockReset();
    mockedUseAuth.mockReset();
    vi.clearAllMocks();
  });

  it("renders sessions list with date and name", () => {
    setup();
    renderWithRouter(<SessionHistory />);

    expect(screen.getByText(/6\/15\/2024/)).toBeInTheDocument();
    expect(screen.getByText(/Morning range/)).toBeInTheDocument();
    expect(screen.getByText(/6\/14\/2024/)).toBeInTheDocument();
  });

  it("expands session to show shots when clicked", async () => {
    setup();
    const user = userEvent.setup();
    renderWithRouter(<SessionHistory />);

    const firstSessionButton = screen.getByText(/6\/15\/2024.*Morning range/);
    await user.click(firstSessionButton);

    expect(screen.getByText("7 Iron — 150.5 yd straight")).toBeInTheDocument();
    expect(screen.getByText("6 Iron — 145 yd left")).toBeInTheDocument();
  });

  it("collapses session when clicked again", async () => {
    setup();
    const user = userEvent.setup();
    renderWithRouter(<SessionHistory />);

    const firstSessionButton = screen.getByText(/6\/15\/2024.*Morning range/);
    await user.click(firstSessionButton);
    expect(screen.getByText("7 Iron — 150.5 yd straight")).toBeInTheDocument();

    await user.click(firstSessionButton);
    expect(
      screen.queryByText("7 Iron — 150.5 yd straight")
    ).not.toBeInTheDocument();
  });

  it("shows 'No shots in this session' for empty sessions", async () => {
    setup();
    const user = userEvent.setup();
    renderWithRouter(<SessionHistory />);

    const secondSessionButton = screen.getByText(/6\/14\/2024/);
    await user.click(secondSessionButton);

    expect(screen.getByText("No shots in this session.")).toBeInTheDocument();
  });

  it("shows 'No sessions yet.' when sessions array is empty", () => {
    setup([]);
    renderWithRouter(<SessionHistory />);

    expect(screen.getByText("No sessions yet.")).toBeInTheDocument();
  });

  it("shows loading state when isLoading is true", () => {
    mockedUseSessions.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useSessions>);
    mockedUseClubs.mockReturnValue({
      data: mockClubs,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useClubs>);
    mockedUseAuth.mockReturnValue({
      user: mockUser,
    } as unknown as ReturnType<typeof useAuth>);
    renderWithRouter(<SessionHistory />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows error state when error is present", () => {
    mockedUseSessions.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load sessions"),
    } as unknown as ReturnType<typeof useSessions>);
    mockedUseClubs.mockReturnValue({
      data: mockClubs,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useClubs>);
    mockedUseAuth.mockReturnValue({
      user: mockUser,
    } as unknown as ReturnType<typeof useAuth>);
    renderWithRouter(<SessionHistory />);

    expect(screen.getByText("Failed to load sessions")).toBeInTheDocument();
  });

  it("converts carry yards to meters when unit_preference is meters", async () => {
    const userWithMeters = { ...mockUser, unit_preference: "meters" };
    mockedUseSessions.mockReturnValue({
      data: mockSessions,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useSessions>);
    mockedUseSessionShots.mockImplementation((sessionId) => {
      const sessionShots =
        sessionId === 1
          ? mockShots
          : sessionId === 2
            ? []
            : mockShots;
      return {
        data: sessionShots,
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useSessionShots>;
    });
    mockedUseClubs.mockReturnValue({
      data: mockClubs,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useClubs>);
    mockedUseAuth.mockReturnValue({
      user: userWithMeters,
    } as unknown as ReturnType<typeof useAuth>);

    const user = userEvent.setup();
    renderWithRouter(<SessionHistory />);

    const firstSessionButton = screen.getByText(/6\/15\/2024.*Morning range/);
    await user.click(firstSessionButton);

    const meterText = screen.getByText("7 Iron — 137.6 m straight");
    expect(meterText).toBeInTheDocument();
  });
});
