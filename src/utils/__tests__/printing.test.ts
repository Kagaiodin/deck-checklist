import { describe, it, expect } from "vitest";
import { normalizeSet, printingOf, samePrinting } from "../printing";
import type { CollectionPrinting } from "../../types/index";

/** A Collection entry; quantity defaults to 1. */
const cp = (o: Partial<CollectionPrinting> = {}): CollectionPrinting => ({ quantity: 1, ...o });

describe("samePrinting", () => {
  it("matches on set, collector number and foil, ignoring quantity", () => {
    expect(samePrinting(cp({ set: "MH2", collectorNumber: "12" }), cp({ quantity: 3, set: "MH2", collectorNumber: "12" }))).toBe(true);
    expect(samePrinting(cp(), cp({ foil: false }))).toBe(true);
    expect(samePrinting(cp({ set: "MH2" }), cp({ set: "MH2", foil: true }))).toBe(false);
    expect(samePrinting(cp({ set: "MH2", collectorNumber: "12" }), cp({ set: "MH2", collectorNumber: "13" }))).toBe(false);
    expect(samePrinting(cp({ set: "MH2" }), cp({ set: "2XM" }))).toBe(false);
  });

  it("matches set codes regardless of case", () => {
    expect(samePrinting(cp({ set: "mh2", collectorNumber: "12" }), cp({ set: "MH2", collectorNumber: "12" }))).toBe(true);
  });

  it("treats a blank set as no set", () => {
    expect(samePrinting(cp({ set: "  " }), cp())).toBe(true);
  });
});

describe("normalizeSet", () => {
  it("trims and uppercases, and turns blank into no set", () => {
    expect(normalizeSet(" mh2 ")).toBe("MH2");
    expect(normalizeSet("")).toBeUndefined();
    expect(normalizeSet(undefined)).toBeUndefined();
  });
});

describe("printingOf", () => {
  it("is the Collection Printing a trade card would match", () => {
    expect(printingOf({ set: "mh2", collectorNumber: "12", finish: "nonfoil" })).toEqual({ set: "MH2", collectorNumber: "12", foil: false });
  });

  it("counts foil and etched as foil", () => {
    expect(printingOf({ set: "cmm", collectorNumber: "400", finish: "foil" }).foil).toBe(true);
    expect(printingOf({ set: "cmm", collectorNumber: "400", finish: "etched" }).foil).toBe(true);
  });

  it("is the same Printing as the Collection entry with that set in another case", () => {
    expect(samePrinting(cp({ quantity: 2, set: "CMM", collectorNumber: "400", foil: true }), printingOf({ set: "cmm", collectorNumber: "400", finish: "etched" }))).toBe(true);
  });
});
