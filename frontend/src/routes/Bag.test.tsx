import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Bag } from "./Bag";
import { useClubs, useCreateClub, useUpdateClub, useDeleteClub } from "../api/hooks";
import type { Club } from "../api/types";

vi.mock("../api/hooks", () => ({
  useClubs: vi.fn(),
  useCreateClub: vi.fn(),
  useUpdateClub: vi.fn(),
  useDeleteClub: vi.fn(),
}));

const mockedUseClubs = vi.mocked(useClubs);
const mockedUseCreateClub = vi.mocked(useCreateClub);
const mockedUseUpdateClub = vi.mocked(useUpdateClub);
const mockedUseDeleteClub = vi.mocked(useDeleteClub);

const clubs: Club[] = [
  { id: 1, label: "7 Iron", category: "iron", order_index: 0, loft: null, brand_model: null, is_active: true },
  { id: 2, label: "Driver", category: "wood", order_index: 1, loft: null, brand_model: null, is_active: false },
];

function setup() {
  const create = { mutate: vi.fn() };
  const update = { mutate: vi.fn() };
  const del = { mutate: vi.fn() };
  mockedUseClubs.mockReturnValue(
    { data: clubs, isLoading: false, error: null } as unknown as ReturnType<typeof useClubs>,
  );
  mockedUseCreateClub.mockReturnValue(create as unknown as ReturnType<typeof useCreateClub>);
  mockedUseUpdateClub.mockReturnValue(update as unknown as ReturnType<typeof useUpdateClub>);
  mockedUseDeleteClub.mockReturnValue(del as unknown as ReturnType<typeof useDeleteClub>);
  return { create, update, del };
}

describe("Bag", () => {
  beforeEach(() => {
    mockedUseClubs.mockReset();
    mockedUseCreateClub.mockReset();
    mockedUseUpdateClub.mockReset();
    mockedUseDeleteClub.mockReset();
  });

  it("renders clubs from useClubs", () => {
    setup();
    render(<Bag />);

    expect(screen.getByDisplayValue("7 Iron")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Driver")).toBeInTheDocument();
  });

  it("creates a club with the form values", async () => {
    const { create } = setup();
    const user = userEvent.setup();
    render(<Bag />);

    await user.type(screen.getByPlaceholderText("Club label (e.g. 7 Iron)"), "Pitching Wedge");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(create.mutate).toHaveBeenCalledWith(
      { label: "Pitching Wedge", category: "iron", order_index: 2 },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("renames a club on blur", async () => {
    const { update } = setup();
    const user = userEvent.setup();
    render(<Bag />);

    const input = screen.getByDisplayValue("7 Iron");
    await user.clear(input);
    await user.type(input, "6 Iron");
    await user.tab();

    expect(update.mutate).toHaveBeenCalledWith(
      { id: 1, body: { label: "6 Iron" } },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("toggles is_active on deactivate/activate", async () => {
    const { update } = setup();
    const user = userEvent.setup();
    render(<Bag />);

    await user.click(screen.getAllByRole("button", { name: "Deactivate" })[0]);

    expect(update.mutate).toHaveBeenCalledWith(
      { id: 1, body: { is_active: false } },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("deletes a club by id", async () => {
    const { del } = setup();
    const user = userEvent.setup();
    render(<Bag />);

    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);

    expect(del.mutate).toHaveBeenCalledWith(1, expect.objectContaining({ onError: expect.any(Function) }));
  });
});
