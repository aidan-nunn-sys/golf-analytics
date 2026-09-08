import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TeeSetup } from "./TeeSetup";
import { useCourse, useTees, useCreateTee, useUpsertTeeRating, useSetStrokeIndex } from "../api/hooks";
import { courseFixture, holeFixture } from "../testFixtures";
import type { TeeSet } from "../api/types";

vi.mock("../api/hooks", () => ({
  useCourse: vi.fn(),
  useTees: vi.fn(),
  useCreateTee: vi.fn(),
  useUpsertTeeRating: vi.fn(),
  useSetStrokeIndex: vi.fn(),
}));

const mockedUseCourse = vi.mocked(useCourse);
const mockedUseTees = vi.mocked(useTees);
const mockedUseCreateTee = vi.mocked(useCreateTee);
const mockedUseUpsertTeeRating = vi.mocked(useUpsertTeeRating);
const mockedUseSetStrokeIndex = vi.mocked(useSetStrokeIndex);

const course = courseFixture({
  holes: [
    holeFixture({ id: 1, number: 1, par: 4, stroke_index: 7 }),
    holeFixture({ id: 2, number: 2, par: 3, stroke_index: 1 }),
  ],
});
const tees: TeeSet[] = [{ id: 4, course_id: 7, name: "Blue", yardage: 6200, ratings: [] }];

function setup() {
  const createTee = { mutate: vi.fn() };
  const upsert = { mutate: vi.fn() };
  const setSi = { mutate: vi.fn() };
  mockedUseCourse.mockReturnValue({ data: course, isLoading: false, error: null } as unknown as ReturnType<typeof useCourse>);
  mockedUseTees.mockReturnValue({ data: tees, isLoading: false, error: null } as unknown as ReturnType<typeof useTees>);
  mockedUseCreateTee.mockReturnValue(createTee as unknown as ReturnType<typeof useCreateTee>);
  mockedUseUpsertTeeRating.mockReturnValue(upsert as unknown as ReturnType<typeof useUpsertTeeRating>);
  mockedUseSetStrokeIndex.mockReturnValue(setSi as unknown as ReturnType<typeof useSetStrokeIndex>);
  render(
    <MemoryRouter initialEntries={["/courses/7/tees"]}>
      <Routes>
        <Route path="/courses/:id/tees" element={<TeeSetup />} />
      </Routes>
    </MemoryRouter>,
  );
  return { createTee, upsert, setSi };
}

describe("TeeSetup", () => {
  beforeEach(() => {
    mockedUseCourse.mockReset();
    mockedUseTees.mockReset();
    mockedUseCreateTee.mockReset();
    mockedUseUpsertTeeRating.mockReset();
    mockedUseSetStrokeIndex.mockReset();
  });

  it("lists existing tee sets", () => {
    setup();
    expect(screen.getByText("Blue")).toBeInTheDocument();
  });

  it("creates a tee set", async () => {
    const { createTee } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Tee name"), "White");
    await user.type(screen.getByLabelText("Yardage"), "5800");
    await user.click(screen.getByRole("button", { name: "Add tee" }));
    expect(createTee.mutate).toHaveBeenCalledWith(
      { courseId: 7, name: "White", yardage: 5800 },
      expect.anything(),
    );
  });

  it("saves an 18-hole rating", async () => {
    const { upsert } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Course rating"), "71.2");
    await user.type(screen.getByLabelText("Slope"), "132");
    await user.type(screen.getByLabelText("Par"), "7");
    await user.click(screen.getByRole("button", { name: "Save 18-hole rating" }));
    expect(upsert.mutate).toHaveBeenCalledWith(
      { teeId: 4, courseId: 7, scope: "18", body: { course_rating: 71.2, slope_rating: 132, par: 7 } },
      expect.anything(),
    );
  });

  it("rejects a rating par that does not match the hole pars", async () => {
    const { upsert } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Course rating"), "71.2");
    await user.type(screen.getByLabelText("Slope"), "132");
    await user.type(screen.getByLabelText("Par"), "72");
    await user.click(screen.getByRole("button", { name: "Save 18-hole rating" }));
    expect(upsert.mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/must equal the sum of hole pars/)).toBeInTheDocument();
  });

  it("rejects a slope outside 55–155 before calling the API", async () => {
    const { upsert } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Course rating"), "71.2");
    await user.type(screen.getByLabelText("Slope"), "200");
    await user.type(screen.getByLabelText("Par"), "72");
    await user.click(screen.getByRole("button", { name: "Save 18-hole rating" }));
    expect(upsert.mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/Slope must be between 55 and 155/)).toBeInTheDocument();
  });

  it("pre-fills stroke indexes from the course and saves a permutation", async () => {
    const { setSi } = setup();
    const user = userEvent.setup();
    expect(screen.getByLabelText("Hole 1 stroke index")).toHaveValue(7);
    await user.clear(screen.getByLabelText("Hole 1 stroke index"));
    await user.type(screen.getByLabelText("Hole 1 stroke index"), "2");
    await user.clear(screen.getByLabelText("Hole 2 stroke index"));
    await user.type(screen.getByLabelText("Hole 2 stroke index"), "1");
    await user.click(screen.getByRole("button", { name: "Save stroke indexes" }));
    expect(setSi.mutate).toHaveBeenCalledWith(
      { courseId: 7, stroke_indexes: [2, 1] },
      expect.anything(),
    );
  });

  it("does not save a non-permutation of stroke indexes", async () => {
    const { setSi } = setup();
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Hole 1 stroke index"));
    await user.type(screen.getByLabelText("Hole 1 stroke index"), "1");
    await user.clear(screen.getByLabelText("Hole 2 stroke index"));
    await user.type(screen.getByLabelText("Hole 2 stroke index"), "1");
    await user.click(screen.getByRole("button", { name: "Save stroke indexes" }));
    expect(setSi.mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/permutation of 1/)).toBeInTheDocument();
  });
});
