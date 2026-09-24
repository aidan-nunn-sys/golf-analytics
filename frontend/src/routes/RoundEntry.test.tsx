import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useCourseLibrary, useCreateRound, useTees } from "../api/hooks";
import { courseFixture, holeFixture, roundFixture } from "../testFixtures";
import { RoundEntry } from "./RoundEntry";

vi.mock("../api/hooks", () => ({ useCourseLibrary: vi.fn(), useCreateRound: vi.fn(), useTees: vi.fn() }));
const course = courseFixture({ holes: [holeFixture(), holeFixture({ id: 2, number: 2, par: 3 }), holeFixture({ id: 10, number: 10 })] });
const mutate = vi.fn();
function setup(entry = "/rounds/new?course=7") {
  render(<MemoryRouter initialEntries={[entry]}><Routes>
    <Route path="/rounds/new" element={<RoundEntry />} />
    <Route path="/rounds/:id/summary" element={<p>Saved scorecard</p>} />
  </Routes></MemoryRouter>);
}
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
function save() { fireEvent.click(screen.getByRole("button", { name: "Save round" })); }
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useCourseLibrary).mockReturnValue({ data: [course, courseFixture({ id: 8, name: "Other course" })], isLoading: false, error: null } as ReturnType<typeof useCourseLibrary>);
  vi.mocked(useTees).mockReturnValue({ data: [{ id: 4, course_id: 7, name: "Blue", yardage: null, ratings: [] }], isLoading: false, error: null } as unknown as ReturnType<typeof useTees>);
  vi.mocked(useCreateRound).mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<typeof useCreateRound>);
});
describe("RoundEntry", () => {
  it("saves a dated completed round, omits unplayed holes, and opens its scorecard", () => {
    setup(); change("Date", "2026-06-01"); change("Tee", "4"); change("Hole 1 strokes", "5"); change("Hole 2 strokes", "3"); save();
    expect(mutate).toHaveBeenCalledWith({ course_id: 7, date: "2026-06-01", tee_set_id: 4, hole_count: 18, status: "completed", holes: [{ number: 1, strokes: 5 }, { number: 2, strokes: 3 }] }, expect.anything());
    act(() => mutate.mock.calls[0][1].onSuccess(roundFixture()));
    expect(screen.getByText("Saved scorecard")).toBeInTheDocument();
  });
  it("requires a date and at least one valid hole score", () => {
    setup(); save(); expect(screen.getByRole("alert")).toHaveTextContent(/date/i);
    change("Date", "2026-06-01"); save(); expect(screen.getByRole("alert")).toHaveTextContent(/at least one/i);
    change("Hole 1 strokes", "1.5"); save(); expect(screen.getByRole("alert")).toHaveTextContent(/whole number/i);
    expect(mutate).not.toHaveBeenCalled();
  });
  it("preserves unknown stats and zero putts, and hides par-three fairways", async () => {
    setup(); change("Date", "2026-06-01"); fireEvent.click(screen.getByLabelText("Full detail"));
    change("Hole 1 strokes", "5"); change("Hole 1 putts", "0"); change("Hole 1 penalties", "1");
    await userEvent.setup().click(screen.getByRole("button", { name: "Hole 1 fairway hit" }));
    expect(screen.queryByRole("button", { name: "Hole 2 fairway hit" })).not.toBeInTheDocument();
    change("Hole 2 strokes", "3"); save();
    expect(mutate.mock.calls[0][0].holes).toEqual([{ number: 1, strokes: 5, putts: 0, penalties: 1, fairway_hit: true }, { number: 2, strokes: 3 }]);
  });
  it("rejects invalid optional stats", () => {
    setup(); change("Date", "2026-06-01"); change("Hole 1 strokes", "5"); fireEvent.click(screen.getByLabelText("Full detail"));
    change("Hole 1 putts", "-1"); save(); expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/putts/i);
  });
  it("only submits the selected nine and does not carry scores between scopes", () => {
    setup(); change("Date", "2026-06-01"); change("Hole 1 strokes", "5"); change("Holes", "9"); change("Nine", "back");
    expect(screen.queryByLabelText("Hole 1 strokes")).not.toBeInTheDocument(); change("Hole 10 strokes", "4"); save();
    expect(mutate.mock.calls[0][0]).toMatchObject({ hole_count: 9, nine: "back", holes: [{ number: 10, strokes: 4 }] });
    change("Nine", "front"); expect(screen.getByLabelText("Hole 1 strokes")).toHaveValue(null);
  });
  it("resets scores and tee when changing courses", () => {
    setup(); change("Tee", "4"); change("Hole 1 strokes", "5"); change("Course", "8");
    expect(screen.getByLabelText("Tee")).toHaveValue(""); expect(screen.getByLabelText("Hole 1 strokes")).toHaveValue(null);
  });
  it("keeps entered data after a failed save and supports retry", () => {
    setup(); change("Date", "2026-06-01"); change("Hole 1 strokes", "5"); save();
    act(() => mutate.mock.calls[0][1].onError(new Error("Save failed")));
    expect(screen.getByRole("alert")).toHaveTextContent("Save failed"); expect(screen.getByLabelText("Hole 1 strokes")).toHaveValue(5);
    fireEvent.click(screen.getByLabelText("Dismiss error")); save(); expect(mutate).toHaveBeenCalledTimes(2);
  });
  it("offers course import when the library is empty", () => {
    vi.mocked(useCourseLibrary).mockReturnValue({ data: [], isLoading: false, error: null } as unknown as ReturnType<typeof useCourseLibrary>);
    setup(); expect(screen.getByText(/Import a course before/)).toBeInTheDocument(); expect(screen.getByRole("link", { name: "Find a course" })).toHaveAttribute("href", "/courses");
  });
  it("disables saving while pending", () => {
    vi.mocked(useCreateRound).mockReturnValue({ mutate, isPending: true } as unknown as ReturnType<typeof useCreateRound>);
    setup(); expect(screen.getByRole("button", { name: /Saving/ })).toBeDisabled();
  });
});
