import { describe, it, expect } from "vitest";
import { yardsToDisplay, displayToYards, unitLabel } from "./units";

describe("units", () => {
  it("passes yards through unchanged", () => {
    expect(yardsToDisplay(150, "yards")).toBe(150);
    expect(displayToYards(150, "yards")).toBe(150);
  });

  it("converts yards to meters and back", () => {
    expect(yardsToDisplay(100, "meters")).toBe(91.4);
    // round-trip within a hundredth of a yard
    expect(displayToYards(91.44, "meters")).toBeCloseTo(100, 2);
  });

  it("labels units", () => {
    expect(unitLabel("yards")).toBe("yd");
    expect(unitLabel("meters")).toBe("m");
  });
});
