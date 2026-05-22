import { describe, it, expect } from "vitest";
import { getFrontFaceName, isDualFace } from "../dualface";

describe("getFrontFaceName", () => {
  it("returns the front face of a dual-faced card", () => {
    expect(getFrontFaceName("Bala Ged Recovery // Bala Ged Sanctuary")).toBe("Bala Ged Recovery");
  });

  it("returns the name unchanged when there is no //", () => {
    expect(getFrontFaceName("Lightning Bolt")).toBe("Lightning Bolt");
  });

  it("trims whitespace from the result", () => {
    expect(getFrontFaceName("  Fire // Ice  ")).toBe("Fire");
  });

  it("handles cards with // in the back face name", () => {
    expect(getFrontFaceName("Wear // Tear")).toBe("Wear");
  });
});

describe("isDualFace", () => {
  it("returns true for an array with two or more faces", () => {
    expect(isDualFace([{}, {}])).toBe(true);
    expect(isDualFace([{}, {}, {}])).toBe(true);
  });

  it("returns false for a single-element array", () => {
    expect(isDualFace([{}])).toBe(false);
  });

  it("returns false for an empty array", () => {
    expect(isDualFace([])).toBe(false);
  });

  it("returns false for null", () => {
    expect(isDualFace(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isDualFace(undefined)).toBe(false);
  });

  it("returns false for a non-array value", () => {
    expect(isDualFace("not an array")).toBe(false);
  });
});
