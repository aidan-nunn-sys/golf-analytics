import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Login } from "./Login";
import { useAuth } from "../auth/AuthContext";

vi.mock("../auth/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Login", () => {
  beforeEach(() => {
    mockedUseAuth.mockReset();
  });

  it("submits credentials and navigates to / on success", async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({ user: null, loading: false, login, logout: vi.fn() });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByPlaceholderText("Email"), "a@b.com");
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(login).toHaveBeenCalledWith("a@b.com", "secret");
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
  });

  it("shows an error message when login fails", async () => {
    const login = vi.fn().mockRejectedValue(new Error("nope"));
    mockedUseAuth.mockReturnValue({ user: null, loading: false, login, logout: vi.fn() });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByPlaceholderText("Email"), "a@b.com");
    await user.type(screen.getByPlaceholderText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Incorrect email or password")).toBeInTheDocument();
  });
});
