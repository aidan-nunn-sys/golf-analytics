import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PageErrorBoundary } from "./PageErrorBoundary";
it("offers recovery after a page fails instead of a blank screen", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  function Broken(): never { throw new Error("Render failure"); }
  try {
    render(<MemoryRouter><PageErrorBoundary><Broken /></PageErrorBoundary></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("This page couldn’t load");
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
  } finally { log.mockRestore(); }
});
