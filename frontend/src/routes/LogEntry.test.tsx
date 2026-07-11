import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LogEntry } from "./LogEntry";

// Mock auth (meters user, to prove conversion) and the hooks module.
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: { unit_preference: "meters" }, loading: false }),
}));

const logMutate = vi.fn();
vi.mock("../api/hooks", () => ({
  useSessions: () => ({ data: [{ id: 5, date: "2026-06-30", name: null }], isLoading: false, error: null }),
  useClubs: () => ({ data: [{ id: 1, label: "7 Iron" }], isLoading: false, error: null }),
  useCreateSession: () => ({ mutate: vi.fn() }),
  useSessionShots: () => ({ data: [] }),
  useLogShot: () => ({ mutate: logMutate }),
  useDeleteShot: () => ({ mutate: vi.fn() }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("LogEntry add-shot form", () => {
  beforeEach(() => logMutate.mockClear());

  it("logs a shot with the selected club, carry in yards, and direction defaulting to straight", async () => {
    render(<LogEntry />, { wrapper });
    const carry = await screen.findByLabelText("carry");
    await userEvent.type(carry, "150");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    // 150 meters / 0.9144 (yards-per-meter factor from units.ts) = 164.041994... yards
    expect(logMutate).toHaveBeenCalledWith(
      { club_id: 1, carry_yards: expect.closeTo(164.04, 2), direction: "straight" },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    await waitFor(() => expect((carry as HTMLInputElement).value).toBe(""));
  });
});
