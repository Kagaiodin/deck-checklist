import { describe, it, expect } from "vitest";
import { deriveBinder, displayName, primaryPrinting, surplusLabel } from "../binderSurplus";
import type { Collection } from "../../../../types/index";
import type { CommittedInfo } from "../../../../types/collection";

const committed = (map: Record<string, number>) => (key: string): CommittedInfo => ({
  total: map[key] ?? 0, deckCount: map[key] ? 1 : 0, decks: [],
});

const collection: Collection = {
  "sol ring": [{ quantity: 3, set: "cmm", collectorNumber: "1", foil: true }, { quantity: 1 }],
  "rhystic study": [{ quantity: 1 }],
  "cultivate": [{ quantity: 5 }],
  "command tower": [{ quantity: 3 }],
};

describe("deriveBinder", () => {
  it("lists owned minus committed when above zero, sorted by name", () => {
    const { rows } = deriveBinder(collection, committed({ "sol ring": 3, "rhystic study": 1, cultivate: 2, "command tower": 2 }), new Set());
    expect(rows.map(r => [r.name, r.owned, r.committed, r.surplus])).toEqual([
      ["Command Tower", 3, 2, 1],
      ["Cultivate", 5, 2, 3],
      ["Sol Ring", 4, 3, 1],
    ]);
  });

  it("drops cards with no spare copies, including over-committed ones", () => {
    const { rows } = deriveBinder(collection, committed({ "rhystic study": 2, cultivate: 5 }), new Set());
    expect(rows.map(r => r.key)).not.toContain("rhystic study");
    expect(rows.map(r => r.key)).not.toContain("cultivate");
  });

  it("moves excluded cards to excludedRows and restores them", () => {
    const decks = committed({});
    const kept = deriveBinder(collection, decks, new Set(["cultivate"]));
    expect(kept.rows.map(r => r.key)).not.toContain("cultivate");
    expect(kept.excludedRows.map(r => r.key)).toEqual(["cultivate"]);
    const restored = deriveBinder(collection, decks, new Set());
    expect(restored.rows.map(r => r.key)).toContain("cultivate");
    expect(restored.excludedRows).toEqual([]);
  });

  it("an excluded card whose surplus hits zero is in neither list", () => {
    const out = deriveBinder(collection, committed({ cultivate: 5 }), new Set(["cultivate"]));
    expect(out.rows.map(r => r.key)).not.toContain("cultivate");
    expect(out.excludedRows).toEqual([]);
  });

  it("returns empty lists for an empty collection", () => {
    expect(deriveBinder({}, committed({}), new Set())).toEqual({ rows: [], excludedRows: [] });
  });
});

describe("helpers", () => {
  it("title-cases keys, leaving small words lower", () => {
    expect(displayName("jace, the mind sculptor")).toBe("Jace, the Mind Sculptor");
    expect(displayName("sol ring")).toBe("Sol Ring");
  });

  it("words partial stacks and leaves out 0 in decks", () => {
    expect(surplusLabel({ owned: 4, committed: 3, surplus: 1 })).toBe("4 owned · 3 in decks · 1 spare");
    expect(surplusLabel({ owned: 2, committed: 0, surplus: 2 })).toBe("2 owned · 2 spare");
  });

  it("picks the largest-quantity printing, first on a tie", () => {
    expect(primaryPrinting({ printings: [{ quantity: 1, set: "a" }, { quantity: 3, set: "b" }, { quantity: 3, set: "c" }] })?.set).toBe("b");
    expect(primaryPrinting({ printings: [] })).toBeUndefined();
  });
});
