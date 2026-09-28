import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CourseNew } from "./CourseNew";
import { useCreateManualCourse } from "../api/hooks";

vi.mock("../api/hooks", () => ({ useCreateManualCourse: vi.fn() }));
const mockedUseCreateManualCourse = vi.mocked(useCreateManualCourse);

function setup() {
  const create = { mutate: vi.fn() };
  mockedUseCreateManualCourse.mockReturnValue(create as unknown as ReturnType<typeof useCreateManualCourse>);
  return { create };
}

describe("CourseNew", () => {
  beforeEach(() => mockedUseCreateManualCourse.mockReset());

  it("starts with one hole row and can add more", async () => {
    setup();
    const user = userEvent.setup();
    render(<CourseNew />, { wrapper: MemoryRouter });

    expect(screen.getAllByPlaceholderText("Par")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Add hole" }));
    expect(screen.getAllByPlaceholderText("Par")).toHaveLength(2);
  });

  it("blocks submit with no course name", async () => {
    const { create } = setup();
    const user = userEvent.setup();
    render(<CourseNew />, { wrapper: MemoryRouter });

    await user.type(screen.getAllByPlaceholderText("Par")[0], "4");
    await user.click(screen.getByRole("button", { name: "Create course" }));

    expect(screen.getByText("Course name is required.")).toBeInTheDocument();
    expect(create.mutate).not.toHaveBeenCalled();
  });

  it("blocks submit when a hole is missing a par", async () => {
    const { create } = setup();
    const user = userEvent.setup();
    render(<CourseNew />, { wrapper: MemoryRouter });

    await user.type(screen.getByPlaceholderText("Course name"), "Backyard Nine");
    await user.click(screen.getByRole("button", { name: "Create course" }));

    expect(screen.getByText("Every hole needs a par.")).toBeInTheDocument();
    expect(create.mutate).not.toHaveBeenCalled();
  });

  it("blocks submit when a hole's par is non-numeric", async () => {
    const { create } = setup();
    const user = userEvent.setup();
    render(<CourseNew />, { wrapper: MemoryRouter });

    await user.type(screen.getByPlaceholderText("Course name"), "Backyard Nine");
    await user.type(screen.getAllByPlaceholderText("Par")[0], "abc");
    await user.click(screen.getByRole("button", { name: "Create course" }));

    expect(screen.getByText("Every hole needs a par.")).toBeInTheDocument();
    expect(create.mutate).not.toHaveBeenCalled();
  });

  it("submits the course name trimmed", async () => {
    const { create } = setup();
    const user = userEvent.setup();
    render(<CourseNew />, { wrapper: MemoryRouter });

    await user.type(screen.getByPlaceholderText("Course name"), "  Pebble  ");
    await user.type(screen.getAllByPlaceholderText("Par")[0], "4");
    await user.click(screen.getByRole("button", { name: "Create course" }));

    expect(create.mutate).toHaveBeenCalledWith(
      { name: "Pebble", holes: [{ number: 1, par: 4 }] },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("submits name and holes when valid", async () => {
    const { create } = setup();
    const user = userEvent.setup();
    render(<CourseNew />, { wrapper: MemoryRouter });

    await user.type(screen.getByPlaceholderText("Course name"), "Backyard Nine");
    await user.type(screen.getAllByPlaceholderText("Par")[0], "4");
    await user.click(screen.getByRole("button", { name: "Create course" }));

    expect(create.mutate).toHaveBeenCalledWith(
      { name: "Backyard Nine", holes: [{ number: 1, par: 4 }] },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});

it("prefills the failed course name and prepares a full scorecard", async () => {
  const { create } = setup();
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={["/courses/new?name=Raleigh%20Golf%20Association"]}><CourseNew /></MemoryRouter>);
  expect(screen.getByPlaceholderText("Course name")).toHaveValue("Raleigh Golf Association");
  await user.click(screen.getByRole("button", { name: "18 holes" }));
  expect(screen.getAllByPlaceholderText("Par")).toHaveLength(18);
  await user.click(screen.getByRole("button", { name: "Create course" }));
  expect(create.mutate).not.toHaveBeenCalled();
  expect(screen.getByText("Every hole needs a par.")).toBeInTheDocument();
});
