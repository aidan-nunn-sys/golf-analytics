import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Sparkline } from "./Sparkline";

it("shows an accessible trend, including flat and negative series", () => {
  const { container, rerender } = render(<Sparkline values={[-2, -2]} label="Index history" />);
  expect(screen.getByRole("img", { name: "Index history" })).toBeInTheDocument();
  expect(container.querySelector("polyline")?.getAttribute("points")).not.toMatch(/NaN|Infinity/);
  rerender(<Sparkline values={[12]} label="Index history" />); expect(container).toBeEmptyDOMElement();
});
