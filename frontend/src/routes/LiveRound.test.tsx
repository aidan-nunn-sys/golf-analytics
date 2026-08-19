import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LiveRound } from "./LiveRound";
import { useRound, useUpdateRound, useUpdateRoundHole } from "../api/hooks";
import type { Round } from "../api/types";

vi.mock("../api/hooks", () => ({
  useRound: vi.fn(),
  useUpdateRound: vi.fn(),
  useUpdateRoundHole: vi.fn(),
}));

const mockedUseRound = vi.mocked(useRound);
const mockedUseUpdateRound = vi.mocked(useUpdateRound);
const mockedUseUpdateRoundHole = vi.mocked(useUpdateRoundHole);

const round: Round = {
  id: 5, course_id: 7, date: "2026-07-19", status: "in_progress", current_hole: 1,
  holes: [
    { hole_number: 1, par: 4, strokes: null },
    { hole_number: 2, par: 3, strokes: null },
  ],
};

function setup(r: Round = round) {
  const updateRound = { mutate: vi.fn() };
  const updateHole = { mutate: vi.fn() };
  mockedUseRound.mockReturnValue({ data: r, isLoading: false, error: null } as unknown as ReturnType<typeof useRound>);
  mockedUseUpdateRound.mockReturnValue(updateRound as unknown as ReturnType<typeof useUpdateRound>);
  mockedUseUpdateRoundHole.mockReturnValue(updateHole as unknown as ReturnType<typeof useUpdateRoundHole>);
  render(
    <MemoryRouter initialEntries={["/rounds/5"]}>
      <Routes>
        <Route path="/rounds/:id" element={<LiveRound />} />
      </Routes>
    </MemoryRouter>,
  );
  return { updateRound, updateHole };
}

describe("LiveRound", () => {
  beforeEach(() => {
    mockedUseRound.mockReset();
    mockedUseUpdateRound.mockReset();
    mockedUseUpdateRoundHole.mockReset();
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
});
