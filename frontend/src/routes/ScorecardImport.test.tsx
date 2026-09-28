import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ScorecardImport } from "./ScorecardImport";
import { useApplyScorecard, useCourse, usePreviewScorecard, useScorecardSources } from "../api/hooks";
import { courseFixture } from "../testFixtures";
import type { ScorecardPreview } from "../api/types";
vi.mock("../api/hooks", () => ({ useApplyScorecard: vi.fn(), useCourse: vi.fn(), usePreviewScorecard: vi.fn(), useScorecardSources: vi.fn() }));
const preview: ScorecardPreview = { token: "signed-preview", conflicts: [], card: {
  source_id: "rga-public", course_name: "RGA Public", source_urls: ["https://www.rgagolf.net/18-hole-course/"], retrieved_at: "2026-09-24T12:00:00Z", notes: ["Public course only"],
  holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, stroke_index: i + 1 })),
  tees: [{ key: "blue", name: "Blue", yardage: 5991, ratings: [{ scope: "18", course_rating: 68.3, slope_rating: 122, par: 72 }] }],
} };
function setup(data?: ScorecardPreview) {
  const apply = { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null };
  const fetch = { mutate: vi.fn(), reset: vi.fn(), data, isPending: false, error: null };
  vi.mocked(useCourse).mockReturnValue({ data: courseFixture({ osm_id: "relation/6406053" }), isLoading: false } as unknown as ReturnType<typeof useCourse>);
  vi.mocked(useScorecardSources).mockReturnValue({ data: [{ id: "rga-public", osm_id: "relation/6406053", name: "RGA Public", address: "Raleigh, NC" }], isLoading: false } as unknown as ReturnType<typeof useScorecardSources>);
  vi.mocked(usePreviewScorecard).mockReturnValue(fetch as unknown as ReturnType<typeof usePreviewScorecard>);
  vi.mocked(useApplyScorecard).mockReturnValue(apply as unknown as ReturnType<typeof useApplyScorecard>);
  render(<MemoryRouter initialEntries={["/courses/7/import"]}><Routes><Route path="/courses/:id/import" element={<ScorecardImport />} /><Route path="/courses/:id" element={<p>Updated course</p>} /></Routes></MemoryRouter>);
  return { apply, fetch };
}
beforeEach(() => vi.clearAllMocks());
it("matches the mapped course and requests a preview without applying", async () => {
  const { apply, fetch } = setup();
  await userEvent.click(screen.getByRole("button", { name: "Preview import" }));
  expect(fetch.mutate).toHaveBeenCalledWith("rga-public");
  expect(apply.mutate).not.toHaveBeenCalled();
});
it("shows source and ratings and applies the signed preview", async () => {
  const { apply } = setup(preview);
  expect(screen.getByRole("link", { name: "Official source 1 ↗" })).toHaveAttribute("href", preview.card.source_urls[0]);
  expect(screen.getByText("Blue")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Apply import" }));
  expect(apply.mutate).toHaveBeenCalledWith({ token: "signed-preview", replace_conflicts: false }, expect.anything());
});
it("requires explicit acknowledgement before replacing saved values", async () => {
  const { apply } = setup({ ...preview, conflicts: ["Hole 1: par 4 → 3"] });
  expect(screen.getByRole("button", { name: "Apply import" })).toBeDisabled();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Apply import" }));
  expect(apply.mutate).toHaveBeenCalledWith({ token: "signed-preview", replace_conflicts: true }, expect.anything());
});
