import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings } from "./Settings";
import { useMe, useUpdateMe } from "../api/hooks";
import type { User } from "../api/types";

vi.mock("../api/hooks", () => ({
  useMe: vi.fn(),
  useUpdateMe: vi.fn(),
}));

const mockedUseMe = vi.mocked(useMe);
const mockedUseUpdateMe = vi.mocked(useUpdateMe);

const user: User = {
  id: 1,
  email: "test@example.com",
  display_name: "Test User",
  unit_preference: "yards",
  is_admin: false,
  created_at: "2024-01-01T00:00:00Z",
};

function setup() {
  const update = { mutate: vi.fn(), isSuccess: false };
  mockedUseMe.mockReturnValue({ data: user, isLoading: false, error: null } as unknown as ReturnType<typeof useMe>);
  mockedUseUpdateMe.mockReturnValue(update as unknown as ReturnType<typeof useUpdateMe>);
  return { update };
}

describe("Settings", () => {
  beforeEach(() => {
    mockedUseMe.mockReset();
    mockedUseUpdateMe.mockReset();
  });

  it("pre-fills the form from useMe", () => {
    setup();
    render(<Settings />, { wrapper: MemoryRouter });

    expect(screen.getByDisplayValue("Test User")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Yards")).toBeInTheDocument();
  });

  it("saves the edited display name and unit preference", async () => {
    const { update } = setup();
    const userSim = userEvent.setup();
    render(<Settings />, { wrapper: MemoryRouter });

    const nameInput = screen.getByDisplayValue("Test User");
    await userSim.clear(nameInput);
    await userSim.type(nameInput, "New Name");
    await userSim.selectOptions(screen.getByDisplayValue("Yards"), "meters");
    await userSim.click(screen.getByRole("button", { name: "Save" }));

    expect(update.mutate).toHaveBeenCalledWith(
      { display_name: "New Name", unit_preference: "meters" },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("shows 'Saved' after a successful mutation", () => {
    const { update } = setup();
    update.isSuccess = true;
    render(<Settings />, { wrapper: MemoryRouter });

    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("displays and dismisses error message when the mutation fails", async () => {
    const { update } = setup();
    const userSim = userEvent.setup();
    update.mutate.mockImplementation((_payload, options) => {
      options.onError?.(new Error("Failed to save settings"));
    });
    render(<Settings />, { wrapper: MemoryRouter });

    await userSim.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Failed to save settings")).toBeInTheDocument();

    await userSim.click(screen.getByRole("button", { name: "Dismiss error" }));

    expect(screen.queryByText("Failed to save settings")).not.toBeInTheDocument();
  });
});
