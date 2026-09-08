import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TeeSetup } from "./TeeSetup";
import { useCourse, useTees, useCreateTee, useUpsertTeeRating, useSetStrokeIndex } from "../api/hooks";
import { courseFixture, holeFixture } from "../testFixtures";
import type { Course, TeeSet } from "../api/types";

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

function setup({ courseData = course, teeData = tees }: { courseData?: Course; teeData?: TeeSet[] } = {}) {
  const createTee = { mutate: vi.fn() };
  const upsert = { mutate: vi.fn() };
  const setSi = { mutate: vi.fn() };
  mockedUseCourse.mockReturnValue({ data: courseData, isLoading: false, error: null } as unknown as ReturnType<typeof useCourse>);
  mockedUseTees.mockReturnValue({ data: teeData, isLoading: false, error: null } as unknown as ReturnType<typeof useTees>);
  mockedUseCreateTee.mockReturnValue(createTee as unknown as ReturnType<typeof useCreateTee>);
  mockedUseUpsertTeeRating.mockReturnValue(upsert as unknown as ReturnType<typeof useUpsertTeeRating>);
  mockedUseSetStrokeIndex.mockReturnValue(setSi as unknown as ReturnType<typeof useSetStrokeIndex>);
  const view = render(
    <MemoryRouter initialEntries={["/courses/7/tees"]}>
      <Routes>
        <Route path="/courses/:id/tees" element={<TeeSetup />} />
      </Routes>
    </MemoryRouter>,
  );
  return { createTee, upsert, setSi, ...view };
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

  it("uses the front-nine hole pars when saving a front-nine rating", async () => {
    const scopedCourse = courseFixture({
      holes: [
        holeFixture({ id: 1, number: 1, par: 4 }),
        holeFixture({ id: 10, number: 10, par: 5 }),
      ],
    });
    const { upsert } = setup({ courseData: scopedCourse });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("front-9 Course rating"), "35.5");
    await user.type(screen.getByLabelText("front-9 Slope"), "125");
    await user.type(screen.getByLabelText("front-9 Par"), "4");
    await user.click(screen.getByRole("button", { name: "Save front-9 rating" }));
    expect(upsert.mutate).toHaveBeenCalledWith(
      { teeId: 4, courseId: 7, scope: "front9", body: { course_rating: 35.5, slope_rating: 125, par: 4 } },
      expect.anything(),
    );
  });

  it("rejects a back-nine rating using the front-nine par sum", async () => {
    const scopedCourse = courseFixture({
      holes: [
        holeFixture({ id: 1, number: 1, par: 4 }),
        holeFixture({ id: 10, number: 10, par: 5 }),
      ],
    });
    const { upsert } = setup({ courseData: scopedCourse });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("back-9 Course rating"), "36.5");
    await user.type(screen.getByLabelText("back-9 Slope"), "130");
    await user.type(screen.getByLabelText("back-9 Par"), "4");
    await user.click(screen.getByRole("button", { name: "Save back-9 rating" }));
    expect(upsert.mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/must equal the sum of hole pars/)).toBeInTheDocument();
  });

  it("preserves unsaved form entries when queries refetch the same course and tee", async () => {
    const { rerender } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("front-9 Course rating"), "35.5");
    await user.clear(screen.getByLabelText("Hole 1 stroke index"));
    await user.type(screen.getByLabelText("Hole 1 stroke index"), "2");

    mockedUseCourse.mockReturnValue({
      data: { ...course, holes: course.holes.map((hole) => ({ ...hole })) },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useCourse>);
    mockedUseTees.mockReturnValue({
      data: tees.map((tee) => ({ ...tee, ratings: [...tee.ratings] })),
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useTees>);
    rerender(
      <MemoryRouter initialEntries={["/courses/7/tees"]}>
        <Routes>
          <Route path="/courses/:id/tees" element={<TeeSetup />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("front-9 Course rating")).toHaveValue(35.5);
    expect(screen.getByLabelText("Hole 1 stroke index")).toHaveValue(2);
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
