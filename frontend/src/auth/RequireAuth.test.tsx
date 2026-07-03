import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RequireAuth } from "./RequireAuth";
import { useAuth } from "./AuthContext";

vi.mock("./AuthContext", () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route path="/login" element={<div>Login screen</div>} />
        <Route
          path="/protected"
          element={
            <RequireAuth>
              <div>Secret content</div>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RequireAuth", () => {
  beforeEach(() => {
    mockedUseAuth.mockReset();
  });

  it("shows a loading state while auth is resolving", () => {
    mockedUseAuth.mockReturnValue({ user: null, loading: true, login: vi.fn(), logout: vi.fn() });
    renderGuard();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText("Secret content")).not.toBeInTheDocument();
  });

  it("redirects to /login when there is no user", () => {
    mockedUseAuth.mockReturnValue({ user: null, loading: false, login: vi.fn(), logout: vi.fn() });
    renderGuard();
    expect(screen.getByText("Login screen")).toBeInTheDocument();
    expect(screen.queryByText("Secret content")).not.toBeInTheDocument();
  });

  it("renders children when a user is present", () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 1,
        email: "a@b.com",
        display_name: "A",
        unit_preference: "yards",
        is_admin: false,
        created_at: "2026-01-01T00:00:00Z",
      },
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    renderGuard();
    expect(screen.getByText("Secret content")).toBeInTheDocument();
  });
});
