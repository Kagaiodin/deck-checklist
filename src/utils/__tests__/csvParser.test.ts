import { describe, it, expect } from "vitest";
import { parseCollectionCSV, applyCollectionToCards } from "../csvParser";

// ── parseCollectionCSV ────────────────────────────────────────────────────────

describe("parseCollectionCSV", () => {
  it("parses a minimal name + count CSV", () => {
    const csv = "name,count\nLightning Bolt,4\nCounterspell,2";
    const result = parseCollectionCSV(csv);
    expect(result["lightning bolt"]).toEqual([{ quantity: 4 }]);
    expect(result["counterspell"]).toEqual([{ quantity: 2 }]);
  });

  it("strips a UTF-8 BOM from the start of the file", () => {
    const csv = "﻿name,count\nLightning Bolt,1";
    const result = parseCollectionCSV(csv);
    expect(result["lightning bolt"]).toEqual([{ quantity: 1 }]);
  });

  it("handles Windows-style CRLF line endings", () => {
    const csv = "name,count\r\nLightning Bolt,3";
    const result = parseCollectionCSV(csv);
    expect(result["lightning bolt"]).toEqual([{ quantity: 3 }]);
  });

  it("parses optional set, collector number, and foil columns", () => {
    const csv = "name,count,edition,collector number,foil\nSol Ring,1,CMR,419,true";
    const result = parseCollectionCSV(csv);
    expect(result["sol ring"]).toEqual([
      { quantity: 1, set: "CMR", collectorNumber: "419", foil: true },
    ]);
  });

  it("normalises the set code to uppercase", () => {
    const csv = "name,count,set\nSol Ring,1,cmr";
    const result = parseCollectionCSV(csv);
    expect(result["sol ring"][0].set).toBe("CMR");
  });

  it("recognises truthy foil values: yes, 1, true", () => {
    const csv = "name,count,foil\nCardA,1,yes\nCardB,1,1\nCardC,1,true\nCardD,1,false";
    const result = parseCollectionCSV(csv);
    expect(result["carda"][0].foil).toBe(true);
    expect(result["cardb"][0].foil).toBe(true);
    expect(result["cardc"][0].foil).toBe(true);
    expect(result["cardd"][0].foil).toBeUndefined();
  });

  it("merges rows with identical set + collector + foil into one entry", () => {
    const csv = "name,count,edition,collector number\nLightning Bolt,2,LEA,100\nLightning Bolt,3,LEA,100";
    const result = parseCollectionCSV(csv);
    expect(result["lightning bolt"]).toHaveLength(1);
    expect(result["lightning bolt"][0].quantity).toBe(5);
  });

  it("keeps rows with different sets as separate printings", () => {
    const csv = "name,count,edition\nLightning Bolt,2,LEA\nLightning Bolt,1,2ED";
    const result = parseCollectionCSV(csv);
    expect(result["lightning bolt"]).toHaveLength(2);
  });

  it("skips rows with zero or negative quantities", () => {
    const csv = "name,count\nLightning Bolt,0\nCounterspell,-1";
    const result = parseCollectionCSV(csv);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("skips rows with no card name", () => {
    const csv = "name,count\n,4\nCounterspell,1";
    const result = parseCollectionCSV(csv);
    expect(Object.keys(result)).toHaveLength(1);
  });

  it("normalises dual-faced card names to the front face", () => {
    const csv = "name,count\nBala Ged Recovery // Bala Ged Sanctuary,1";
    const result = parseCollectionCSV(csv);
    expect(result["bala ged recovery"]).toEqual([{ quantity: 1 }]);
    expect(result["bala ged recovery // bala ged sanctuary"]).toBeUndefined();
  });

  it("handles quoted fields containing commas", () => {
    const csv = `name,count\n"Odds, Bodkins",1`;
    const result = parseCollectionCSV(csv);
    expect(result["odds, bodkins"]).toEqual([{ quantity: 1 }]);
  });

  it("throws when the required 'name' column is missing", () => {
    const csv = "count,edition\n1,LEA";
    expect(() => parseCollectionCSV(csv)).toThrow(/card name/i);
  });

  it("throws when the required 'count' column is missing", () => {
    const csv = "name,edition\nSol Ring,CMR";
    expect(() => parseCollectionCSV(csv)).toThrow(/quantity/i);
  });

  it("throws when the CSV has no data rows", () => {
    expect(() => parseCollectionCSV("name,count")).toThrow(/empty/i);
  });
});

// ── applyCollectionToCards ────────────────────────────────────────────────────

type SimpleCard = {
  name: string;
  quantity: number;
  source?: string;
  manuallyTagged?: boolean;
};

function makeCard(overrides: Partial<SimpleCard> & { name: string; quantity: number }): SimpleCard {
  return { ...overrides };
}

describe("applyCollectionToCards", () => {
  it("sets source to 'owned' when collection qty >= card quantity", () => {
    const cards = [makeCard({ name: "Lightning Bolt", quantity: 4 })];
    const collection = { "lightning bolt": [{ quantity: 4 }] };
    const result = applyCollectionToCards(cards, collection);
    expect(result[0].source).toBe("owned");
  });

  it("sums across multiple printings when checking ownership", () => {
    const cards = [makeCard({ name: "Sol Ring", quantity: 2 })];
    const collection = {
      "sol ring": [{ quantity: 1, set: "CMR" }, { quantity: 1, set: "C21" }],
    };
    const result = applyCollectionToCards(cards, collection);
    expect(result[0].source).toBe("owned");
  });

  it("does not tag 'owned' when collection qty < card quantity", () => {
    const cards = [makeCard({ name: "Lightning Bolt", quantity: 4 })];
    const collection = { "lightning bolt": [{ quantity: 3 }] };
    const result = applyCollectionToCards(cards, collection);
    expect(result[0].source).toBeUndefined();
  });

  it("removes 'owned' tag when collection no longer covers the quantity", () => {
    const cards = [makeCard({ name: "Lightning Bolt", quantity: 4, source: "owned" })];
    const collection = { "lightning bolt": [{ quantity: 2 }] };
    const result = applyCollectionToCards(cards, collection);
    expect(result[0].source).toBeUndefined();
  });

  it("leaves card unchanged when collection qty < need and source is not 'owned'", () => {
    const cards = [makeCard({ name: "Lightning Bolt", quantity: 4, source: "ordered" })];
    const collection = { "lightning bolt": [{ quantity: 1 }] };
    const result = applyCollectionToCards(cards, collection);
    expect(result[0].source).toBe("ordered");
  });

  it("skips cards with manuallyTagged = true", () => {
    const cards = [
      makeCard({ name: "Lightning Bolt", quantity: 4, source: "proxy", manuallyTagged: true }),
    ];
    const collection = { "lightning bolt": [{ quantity: 10 }] };
    const result = applyCollectionToCards(cards, collection);
    expect(result[0].source).toBe("proxy"); // unchanged
  });

  it("treats cards not in the collection as qty 0", () => {
    const cards = [makeCard({ name: "Black Lotus", quantity: 1 })];
    const result = applyCollectionToCards(cards, {});
    expect(result[0].source).toBeUndefined();
  });

  it("does not mutate the original card array", () => {
    const cards = [makeCard({ name: "Lightning Bolt", quantity: 4 })];
    const collection = { "lightning bolt": [{ quantity: 4 }] };
    const result = applyCollectionToCards(cards, collection);
    expect(result).not.toBe(cards);
    expect(cards[0].source).toBeUndefined(); // original unchanged
  });
});
