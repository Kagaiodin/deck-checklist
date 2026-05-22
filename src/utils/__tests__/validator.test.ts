import { describe, it, expect } from "vitest";
import { pickCardColors } from "../validator";

// ── pickCardColors ────────────────────────────────────────────────────────────
//
// This is the core logic that decides which Scryfall color field to store on a
// Card. The rules are:
//   - Dual-face cards  → front face colors (falls back to color_identity)
//   - Land cards       → color_identity  (so shock/fetch lands get the right colors)
//   - Everything else  → colors          (falls back to color_identity)

describe("pickCardColors", () => {
  // ── Non-land spells ─────────────────────────────────────────────────────────

  it("returns colors for a non-land card", () => {
    expect(pickCardColors("Instant", ["R"], ["R"], false, undefined)).toEqual(["R"]);
  });

  it("falls back to color_identity when colors is undefined on a non-land", () => {
    expect(pickCardColors("Creature — Human", undefined, ["W", "B"], false, undefined)).toEqual(["W", "B"]);
  });

  it("returns empty array for a colorless artifact", () => {
    expect(pickCardColors("Artifact", [], [], false, undefined)).toEqual([]);
  });

  // ── Land cards ──────────────────────────────────────────────────────────────

  it("uses color_identity for a basic land (colors is [])", () => {
    // Plains: colors=[], color_identity=["W"]
    expect(pickCardColors("Basic Land — Plains", [], ["W"], false, undefined)).toEqual(["W"]);
  });

  it("uses color_identity for a shock land", () => {
    // Godless Shrine: colors=[], color_identity=["W","B"]
    expect(pickCardColors("Land — Plains Swamp", [], ["W", "B"], false, undefined)).toEqual(["W", "B"]);
  });

  it("uses color_identity for a fetch land", () => {
    // Scalding Tarn: colors=[], color_identity=["U","R"]
    expect(pickCardColors("Land", [], ["U", "R"], false, undefined)).toEqual(["U", "R"]);
  });

  it("returns empty array for a truly colorless land (e.g. Wastes)", () => {
    // Wastes: colors=[], color_identity=[]
    expect(pickCardColors("Basic Land", [], [], false, undefined)).toEqual([]);
  });

  it("returns empty array for Field of the Dead (colorless utility land)", () => {
    expect(pickCardColors("Land", [], [], false, undefined)).toEqual([]);
  });

  // ── Dual-face cards ─────────────────────────────────────────────────────────

  it("uses front face colors for a dual-face spell // land", () => {
    // Bala Ged Recovery // Bala Ged Sanctuary
    // Front: Sorcery, colors=["G"]; back: Land
    expect(pickCardColors("Sorcery\nLand", undefined, ["G"], true, ["G"])).toEqual(["G"]);
  });

  it("falls back to color_identity when front face colors is undefined on a dual-face", () => {
    expect(pickCardColors("Creature", undefined, ["U", "R"], true, undefined)).toEqual(["U", "R"]);
  });

  it("dual-face takes front-face colors even when type_line contains 'Land'", () => {
    // If somehow both dual and land: dual flag wins, uses front face
    expect(pickCardColors("Land", undefined, ["W"], true, ["W", "B"])).toEqual(["W", "B"]);
  });

  // ── Type line matching ───────────────────────────────────────────────────────

  it("treats 'Snow Land' as a land", () => {
    expect(pickCardColors("Snow Land — Forest", [], ["G"], false, undefined)).toEqual(["G"]);
  });

  it("treats 'Artifact Land' as a land", () => {
    // Darksteel Citadel: colors=[], color_identity=[]
    expect(pickCardColors("Artifact Land", [], [], false, undefined)).toEqual([]);
  });
});
