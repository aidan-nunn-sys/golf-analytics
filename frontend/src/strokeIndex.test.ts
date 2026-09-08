import { describe, it, expect } from "vitest";
import { isStrokeIndexPermutation } from "./strokeIndex";

describe("isStrokeIndexPermutation", () => {
  it("accepts 1..n in any order", () => {
    expect(isStrokeIndexPermutation([2, 1, 3], 3)).toBe(true);
  });
  it("rejects duplicates, gaps, and the wrong length", () => {
    expect(isStrokeIndexPermutation([1, 1, 3], 3)).toBe(false);
    expect(isStrokeIndexPermutation([1, 2], 3)).toBe(false);
    expect(isStrokeIndexPermutation([1, 2, 4], 3)).toBe(false);
  });
});
