import { describe, it, expect } from "vitest";
import { parseDecklist } from "../parser";

describe("parseDecklist", () => {
  it("parses a basic quantity + name line", () => {
    expect(parseDecklist("4 Lightning Bolt")).toEqual([{ count: 4, name: "Lightning Bolt" }]);
  });

  it("parses quantity with an 'x' separator", () => {
    expect(parseDecklist("4x Lightning Bolt")).toEqual([{ count: 4, name: "Lightning Bolt" }]);
    expect(parseDecklist("2x  Counterspell")).toEqual([{ count: 2, name: "Counterspell" }]);
  });

  it("parses multiple cards from a multi-line string", () => {
    const input = "4 Lightning Bolt\n2 Counterspell\n1 Black Lotus";
    expect(parseDecklist(input)).toEqual([
      { count: 4, name: "Lightning Bolt" },
      { count: 2, name: "Counterspell" },
      { count: 1, name: "Black Lotus" },
    ]);
  });

  it("skips empty lines", () => {
    const input = "4 Lightning Bolt\n\n2 Counterspell";
    expect(parseDecklist(input)).toHaveLength(2);
  });

  it("skips comment lines starting with //", () => {
    const input = "// Burn spells\n4 Lightning Bolt";
    expect(parseDecklist(input)).toEqual([{ count: 4, name: "Lightning Bolt" }]);
  });

  it("skips comment lines starting with #", () => {
    const input = "# Sideboard\n2 Tormod's Crypt";
    expect(parseDecklist(input)).toEqual([{ count: 2, name: "Tormod's Crypt" }]);
  });

  it("skips lines with no leading number", () => {
    expect(parseDecklist("Lightning Bolt")).toEqual([]);
  });

  it("strips Moxfield/MTGO set + collector number metadata", () => {
    expect(parseDecklist("4 Lightning Bolt (2XM) 309")).toEqual([
      { count: 4, name: "Lightning Bolt" },
    ]);
  });

  it("strips set metadata including non-numeric collector numbers", () => {
    expect(parseDecklist("1 Sol Ring (PLST) CON-31")).toEqual([
      { count: 1, name: "Sol Ring" },
    ]);
  });

  it("strips foil indicator *F* from Moxfield exports", () => {
    expect(parseDecklist("1 Mox Opal (SLD) 2221 *F*")).toEqual([
      { count: 1, name: "Mox Opal" },
    ]);
  });

  it("strips double-slash DFC back face names", () => {
    expect(parseDecklist("1 Bala Ged Recovery // Bala Ged Sanctuary")).toEqual([
      { count: 1, name: "Bala Ged Recovery" },
    ]);
  });

  it("strips single-slash DFC back face names (Moxfield format)", () => {
    expect(parseDecklist("1 Delver of Secrets / Insectile Aberration")).toEqual([
      { count: 1, name: "Delver of Secrets" },
    ]);
  });

  it("strips DFC metadata together with set metadata", () => {
    expect(parseDecklist("1 Bala Ged Recovery // Bala Ged Sanctuary (ZNR) 180")).toEqual([
      { count: 1, name: "Bala Ged Recovery" },
    ]);
  });

  it("handles a realistic full decklist", () => {
    const input = `
// Creatures
4 Ragavan, Nimble Pilferer (MH2) 138
2x Dragon's Rage Channeler (MH2) 121

// Spells
4 Lightning Bolt
4 Fire // Ice (INV) 206 *F*
    `.trim();

    const result = parseDecklist(input);
    expect(result).toEqual([
      { count: 4, name: "Ragavan, Nimble Pilferer" },
      { count: 2, name: "Dragon's Rage Channeler" },
      { count: 4, name: "Lightning Bolt" },
      { count: 4, name: "Fire" },
    ]);
  });
});
