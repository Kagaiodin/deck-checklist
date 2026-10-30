import { describe, it, expect } from "vitest";
import { groupCollectionBySet } from "../collectionGroups";

const entry = (name: string, printings: { quantity: number; set?: string; collectorNumber?: string; foil?: boolean }[]) => ({
  name, printings, total: printings.reduce((s, p) => s + p.quantity, 0),
});

describe("groupCollectionBySet", () => {
  it("places a multi-printing card in each of its sets", () => {
    const groups = groupCollectionBySet([
      entry("sol ring", [{ quantity: 1, set: "c21" }, { quantity: 2, set: "cmm" }]),
    ]);
    expect(groups.map(g => g.set)).toEqual(["C21", "CMM"]);
    expect(groups[1].rows[0]).toMatchObject({ name: "sol ring", total: 2, indices: [1] });
  });

  it("merges same-set printings of one card into one row with original indices", () => {
    const [g] = groupCollectionBySet([
      entry("a", [{ quantity: 1, set: "war" }, { quantity: 1, set: "mh2" }, { quantity: 3, set: "war", foil: true }]),
    ]);
    expect(g.set).toBe("MH2");
    const war = groupCollectionBySet([
      entry("a", [{ quantity: 1, set: "war" }, { quantity: 1, set: "mh2" }, { quantity: 3, set: "war", foil: true }]),
    ])[1];
    expect(war.cards).toBe(1);
    expect(war.copies).toBe(4);
    expect(war.rows[0].indices).toEqual([0, 2]);
  });

  it("puts the Unknown group last, even when its sort would come first", () => {
    const groups = groupCollectionBySet([
      entry("a", [{ quantity: 1 }]),
      entry("b", [{ quantity: 1, set: "zzz" }]),
    ]);
    expect(groups.map(g => g.set)).toEqual(["ZZZ", null]);
  });

  it("orders rows by numeric collector number, then name", () => {
    const [g] = groupCollectionBySet([
      entry("c", [{ quantity: 1, set: "war", collectorNumber: "10" }]),
      entry("b", [{ quantity: 1, set: "war", collectorNumber: "2" }]),
      entry("z", [{ quantity: 1, set: "war" }]),
      entry("a", [{ quantity: 1, set: "war" }]),
    ]);
    expect(g.rows.map(r => r.name)).toEqual(["b", "c", "a", "z"]);
  });

  it("counts only printings passing the filter and drops empty groups", () => {
    const groups = groupCollectionBySet(
      [
        entry("a", [{ quantity: 1, set: "war" }, { quantity: 2, set: "mh2", foil: true }]),
        entry("b", [{ quantity: 1, set: "war" }]),
      ],
      p => !!p.foil,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ set: "MH2", cards: 1, copies: 2 });
  });
});
