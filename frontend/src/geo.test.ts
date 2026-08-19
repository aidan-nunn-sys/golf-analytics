import { describe, it, expect } from "vitest";
import { distanceYards } from "./geo";

describe("distanceYards", () => {
  it("returns 0 for the same point", () => {
    expect(distanceYards(36.5, -121.9, 36.5, -121.9)).toBe(0);
  });

  it("matches the backend's known-distance fixture", () => {
    // 0.001 degrees of latitude ~ 111 meters ~ 121.4 yards (mirrors backend/tests/test_geo.py)
    const d = distanceYards(36.5, -121.9, 36.501, -121.9);
    expect(d).toBeGreaterThan(115);
    expect(d).toBeLessThan(125);
  });
});
