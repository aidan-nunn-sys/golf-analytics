import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./AuthContext";
import { RequireAuth } from "./RequireAuth";
import { apiGet, setToken } from "../api/client";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

const user = {
  id: 1,
  email: "a@b.com",
  display_name: "A",
  is_admin: false,
  unit_preference: "yards" as const,
  created_at: "2026-01-01T00:00:00Z",
};

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/protected"]}>
        <AuthProvider>
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
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AuthContext integration: 401 clears token and redirects", () => {
  beforeEach(() => setToken(null));

  it("bootstraps from an existing token and renders protected content", async () => {
    setToken("valid-token");
    globalThis.fetch = mockFetch(200, user) as never;

    renderApp();

    expect(await screen.findByText("Secret content")).toBeInTheDocument();
  });

  it("clears the token and redirects to /login when any request gets a 401", async () => {
    setToken("stale-token");
    globalThis.fetch = mockFetch(200, user) as never;

    renderApp();
    await screen.findByText("Secret content");

    // Simulate a later request (e.g. from another screen) getting a 401.
    globalThis.fetch = mockFetch(401, { detail: "expired" }) as never;
    await expect(apiGet("/clubs")).rejects.toThrow();

    await waitFor(() => expect(screen.getByText("Login screen")).toBeInTheDocument());
    expect(screen.queryByText("Secret content")).not.toBeInTheDocument();
  });
});
