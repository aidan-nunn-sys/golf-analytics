import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { LiveRound } from "./LiveRound";
import { useRound, useUpdateRound, useUpdateRoundHole, useCourse, useLogRoundShot, useClubs } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import type { Round, Course, Club, User } from "../api/types";
import { courseFixture, holeFixture, roundFixture, roundHoleFixture } from "../testFixtures";

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
}));

vi.mock("../api/hooks", () => ({
  useRound: vi.fn(),
  useUpdateRound: vi.fn(),
  useUpdateRoundHole: vi.fn(),
  useCourse: vi.fn(),
  useLogRoundShot: vi.fn(),
  useClubs: vi.fn(),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const mockedUseRound = vi.mocked(useRound);
const mockedUseUpdateRound = vi.mocked(useUpdateRound);
const mockedUseUpdateRoundHole = vi.mocked(useUpdateRoundHole);
const mockedUseCourse = vi.mocked(useCourse);
const mockedUseLogRoundShot = vi.mocked(useLogRoundShot);
const mockedUseClubs = vi.mocked(useClubs);
const mockedUseAuth = vi.mocked(useAuth);

const round = roundFixture({
  holes: [
    roundHoleFixture(),
    roundHoleFixture({ hole_number: 2, par: 3 }),
  ],
});

const osmCourse = courseFixture({
  imported_at: "",
  holes: [holeFixture({ green_lat: 36.51, green_lng: -121.91 })],
});
const manualCourse = courseFixture({ ...osmCourse, import_source: "manual" });
const clubs: Club[] = [{ id: 2, label: "7 Iron", category: "iron", order_index: 0, loft: null, brand_model: null, is_active: true }];

const mockUser: User = {
  id: 1,
  email: "test@example.com",
  display_name: "Test User",
  unit_preference: "yards",
  is_admin: false,
  created_at: "2024-01-01T00:00:00Z",
};

function mockGeolocation(coords: { latitude: number; longitude: number; accuracy: number } | null) {
  const watchPosition = vi.fn((success: PositionCallback) => {
    if (coords) success({ coords, timestamp: Date.now() } as GeolocationPosition);
    return 1;
  });
  Object.defineProperty(globalThis.navigator, "geolocation", {
    configurable: true,
    value: { watchPosition, clearWatch: vi.fn() },
  });
  return watchPosition;
}

// `course` and `user` are overridable (mirrors the existing `r: Round` param) so tests that need a
// different course (manual import) or user can pass it in, rather than pre-configuring the mock
// before calling setup() — the mock's return value would just get clobbered by setup()'s own
// default assignment otherwise, since mockReturnValue always wins on last-call.
function setup(r: Round = round, c: Course = osmCourse, u: User = mockUser) {
  const updateRound = { mutate: vi.fn() };
  const updateHole = { mutate: vi.fn() };
  const logShot = { mutate: vi.fn() };
  mockedUseRound.mockReturnValue({ data: r, isLoading: false, error: null } as unknown as ReturnType<typeof useRound>);
  mockedUseUpdateRound.mockReturnValue(updateRound as unknown as ReturnType<typeof useUpdateRound>);
  mockedUseUpdateRoundHole.mockReturnValue(updateHole as unknown as ReturnType<typeof useUpdateRoundHole>);
  mockedUseCourse.mockReturnValue({ data: c, isLoading: false, error: null } as unknown as ReturnType<typeof useCourse>);
  mockedUseLogRoundShot.mockReturnValue(logShot as unknown as ReturnType<typeof useLogRoundShot>);
  mockedUseClubs.mockReturnValue({ data: clubs, isLoading: false, error: null } as unknown as ReturnType<typeof useClubs>);
  mockedUseAuth.mockReturnValue({ user: u } as unknown as ReturnType<typeof useAuth>);
  render(
    <MemoryRouter initialEntries={["/rounds/5"]}>
      <Routes>
        <Route path="/rounds/:id" element={<LiveRound />} />
      </Routes>
    </MemoryRouter>,
  );
  return { updateRound, updateHole, logShot };
}

describe("LiveRound", () => {
  beforeEach(() => {
    mockedUseRound.mockReset();
    mockedUseUpdateRound.mockReset();
    mockedUseUpdateRoundHole.mockReset();
    mockedUseCourse.mockReset();
    mockedUseLogRoundShot.mockReset();
    mockedUseClubs.mockReset();
    mockedUseAuth.mockReset();
  });

  it("shows the current hole's par", () => {
    setup();
    expect(screen.getByText("Hole 1")).toBeInTheDocument();
    expect(screen.getByText("Par 4")).toBeInTheDocument();
  });

  it("saves strokes for the current hole", async () => {
    const { updateHole } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Strokes"), "5");
    await user.click(screen.getByRole("button", { name: "Save strokes" }));
    expect(updateHole.mutate).toHaveBeenCalledWith(
      { number: 1, strokes: 5 },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it("advances to the next hole", async () => {
    const { updateRound } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Next hole" }));
    expect(updateRound.mutate).toHaveBeenCalledWith(
      { current_hole: 2 },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("resets the strokes input after advancing without saving", async () => {
    setup();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Strokes"), "3");
    expect(screen.getByPlaceholderText("Strokes")).toHaveValue("3");
    await user.click(screen.getByRole("button", { name: "Next hole" }));
    expect(screen.getByPlaceholderText("Strokes")).toHaveValue("");
  });

  it("rejects non-numeric strokes input and shows an error instead of saving", async () => {
    const { updateHole } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Strokes"), "abc");
    await user.click(screen.getByRole("button", { name: "Save strokes" }));
    expect(updateHole.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid number of strokes.")).toBeInTheDocument();
  });

  it("shows Finish round on the last hole and marks the round completed", async () => {
    const { updateRound } = setup({ ...round, current_hole: 2 });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Finish round" }));
    expect(updateRound.mutate).toHaveBeenCalledWith(
      { status: "completed" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("renders the map and distance-to-pin when geolocation is available", () => {
    mockGeolocation({ latitude: 36.505, longitude: -121.905, accuracy: 5 });
    setup();
    expect(screen.getByTestId("map")).toBeInTheDocument();
    expect(screen.getByText(/to green/)).toBeInTheDocument();
  });

  it("hides the map and shows a message when geolocation is denied", () => {
    mockGeolocation(null);
    const watchPosition = vi.fn((_success: PositionCallback, error?: PositionErrorCallback) => {
      error?.({ code: 1, message: "denied" } as GeolocationPositionError);
      return 1;
    });
    Object.defineProperty(globalThis.navigator, "geolocation", {
      configurable: true,
      value: { watchPosition, clearWatch: vi.fn() },
    });
    setup();
    expect(screen.getByText("Location unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("map")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark shot start" })).not.toBeInTheDocument();
  });

  it("hides the map for a manually-entered course even with geolocation available", () => {
    mockGeolocation({ latitude: 36.505, longitude: -121.905, accuracy: 5 });
    setup(round, manualCourse);
    expect(screen.queryByTestId("map")).not.toBeInTheDocument();
  });

  it("resets shot-in-progress state after advancing without logging the shot", async () => {
    mockGeolocation({ latitude: 36.505, longitude: -121.905, accuracy: 5 });
    setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Mark shot start" }));
    await user.click(screen.getByRole("button", { name: "I'm at my ball" }));
    expect(screen.getByRole("button", { name: "Log shot" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next hole" }));

    expect(screen.getByRole("button", { name: "Mark shot start" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I'm at my ball" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log shot" })).not.toBeInTheDocument();
  });

  it("hides shot-logging UI for a manually-entered course even with geolocation available", () => {
    mockGeolocation({ latitude: 36.505, longitude: -121.905, accuracy: 5 });
    setup(round, manualCourse);
    expect(screen.queryByRole("button", { name: "Mark shot start" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I'm at my ball" })).not.toBeInTheDocument();
  });

  it("logs a shot on the two-tap flow", async () => {
    mockGeolocation({ latitude: 36.505, longitude: -121.905, accuracy: 5 });
    const { logShot } = setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Mark shot start" }));
    await user.click(screen.getByRole("button", { name: "I'm at my ball" }));
    await user.selectOptions(screen.getByLabelText("Club"), "2");
    await user.click(screen.getByRole("button", { name: "Log shot" }));

    expect(logShot.mutate).toHaveBeenCalledWith({
      club_id: 2,
      start_lat: 36.505,
      start_lng: -121.905,
      end_lat: 36.505,
      end_lng: -121.905,
      direction: "straight",
      accuracy: "5",
      hole_number: 1,
    });
  });
});
