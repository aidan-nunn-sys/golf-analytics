import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useCourse, useDeleteRound, useRound, useUpdateRound } from "../api/hooks";
import { courseFixture, roundFixture } from "../testFixtures";
import { RoundManage } from "./RoundManage";

vi.mock("../api/hooks", () => ({ useCourse: vi.fn(), useDeleteRound: vi.fn(), useRound: vi.fn(), useUpdateRound: vi.fn() }));
const save = vi.fn();
const remove = vi.fn();
function setup(error: Error | null = null) {
  vi.mocked(useRound).mockReturnValue({ data: roundFixture({ notes: "Old notes" }), isLoading: false, error: null } as ReturnType<typeof useRound>);
  vi.mocked(useCourse).mockReturnValue({ data: courseFixture() } as ReturnType<typeof useCourse>);
  vi.mocked(useUpdateRound).mockReturnValue({ mutate: save, isPending: false, error } as unknown as ReturnType<typeof useUpdateRound>);
  vi.mocked(useDeleteRound).mockReturnValue({ mutate: remove, isPending: false, error: null } as unknown as ReturnType<typeof useDeleteRound>);
  return render(<MemoryRouter initialEntries={["/rounds/5/edit"]}><Routes><Route path="/rounds/:id/edit" element={<RoundManage />} /><Route path="/rounds" element={<p>Round history</p>} /></Routes></MemoryRouter>);
}

describe("RoundManage", () => {
  beforeEach(() => { save.mockReset(); remove.mockReset(); });
  it("saves corrected dates and notes", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Date played"), { target: { value: "2026-09-02" } });
    fireEvent.change(screen.getByLabelText("Round notes"), { target: { value: "Aim left on 7" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(save).toHaveBeenCalledWith({ date: "2026-09-02", notes: "Aim left on 7" }, expect.any(Object));
  });
  it("keeps the draft when saving fails", () => {
    save.mockImplementation(() => {});
    setup(new Error("Server unavailable"));
    fireEvent.change(screen.getByLabelText("Round notes"), { target: { value: "Keep my notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Server unavailable");
    expect(screen.getByLabelText("Round notes")).toHaveValue("Keep my notes");
  });
  it("requires confirmation and allows cancelling before deletion", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete round" }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Move to Trash" })).not.toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete round" }));
    remove.mockImplementation((_value, options) => options.onSuccess());
    fireEvent.click(screen.getByRole("button", { name: "Move to Trash" }));
    expect(remove).toHaveBeenCalledOnce();
    expect(screen.getByText("Round history")).toBeInTheDocument();
  });
});
