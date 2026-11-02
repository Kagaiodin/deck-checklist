import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { evaluatePartnerPair, checkPartnerPair, clearPartnerCache, type PartnerCardInfo } from "../partnerCheck";

const c = (name: string, o: Partial<PartnerCardInfo> = {}): PartnerCardInfo =>
  ({ name, keywords: [], oracleText: "", typeLine: "Legendary Creature", ...o });

describe("evaluatePartnerPair", () => {
  it("accepts Partner + Partner", () => {
    expect(evaluatePartnerPair(c("A", { keywords: ["Partner"] }), c("B", { keywords: ["Partner"] }))).toBe(true);
  });
  it("accepts matched Partner with", () => {
    const a = c("Pir", { keywords: ["Partner with"], oracleText: "Partner with Toothy, Imaginary Friend (reminder)" });
    const b = c("Toothy, Imaginary Friend", { keywords: ["Partner with"], oracleText: "Partner with Pir" });
    expect(evaluatePartnerPair(a, b)).toBe(true);
  });
  it("rejects mismatched Partner with", () => {
    const a = c("Pir", { keywords: ["Partner with"], oracleText: "Partner with Toothy" });
    const b = c("Other", { keywords: ["Partner with"], oracleText: "Partner with Someone" });
    expect(evaluatePartnerPair(a, b)).toBe(false);
  });
  it("rejects Partner + Partner with (Scryfall tags both keywords on Partner with cards)", () => {
    const a = c("A", { keywords: ["Partner"] });
    const b = c("Pir", { keywords: ["Partner with", "Partner"], oracleText: "Partner with A" });
    expect(evaluatePartnerPair(a, b)).toBe(false);
  });
  it("accepts Friends forever", () => {
    const f = { keywords: ["Friends forever"] };
    expect(evaluatePartnerPair(c("A", f), c("B", f))).toBe(true);
  });
  it("accepts Background pairing both ways", () => {
    const a = c("A", { keywords: ["Choose a Background"] });
    const bg = c("Bg", { typeLine: "Legendary Enchantment — Background" });
    expect(evaluatePartnerPair(a, bg)).toBe(true);
    expect(evaluatePartnerPair(bg, a)).toBe(true);
  });
  it("accepts Doctor's companion with a Time Lord Doctor", () => {
    const a = c("Companion", { keywords: ["Doctor's companion"] });
    const d = c("Doc", { typeLine: "Legendary Creature — Time Lord Doctor" });
    expect(evaluatePartnerPair(d, a)).toBe(true);
  });
  it("rejects unrelated commanders", () => {
    expect(evaluatePartnerPair(c("A"), c("B"))).toBe(false);
  });
  it("matches a double-faced partner-with target by front face", () => {
    const a = c("Front // Back", { keywords: ["Partner with"], oracleText: "Partner with Other" });
    const b = c("Other", { keywords: ["Partner with"], oracleText: "Partner with Front" });
    expect(evaluatePartnerPair(a, b)).toBe(true);
  });
});

describe("checkPartnerPair", () => {
  const card = (name: string, keywords: string[]) => ({ name, keywords, oracle_text: "", type_line: "Legendary Creature" });
  beforeEach(() => clearPartnerCache());
  afterEach(() => vi.unstubAllGlobals());

  it("evaluates a fetched pair and caches it per pair", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: [card("A", ["Partner"]), card("B", ["Partner"])], not_found: [] }) }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkPartnerPair("A", "B")).toBe(true);
    expect(await checkPartnerPair("b", "a")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to card_faces text", async () => {
    const face = (t: string) => ({ name: "X", keywords: [], card_faces: [{ oracle_text: t, type_line: "Creature" }] });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ ...face("Partner with Y"), name: "X", keywords: ["Partner with"] }, { ...face("Partner with X"), name: "Y", keywords: ["Partner with"] }], not_found: [] }) })));
    expect(await checkPartnerPair("X", "Y")).toBe(true);
  });

  it.each([
    ["non-OK", async () => ({ ok: false, json: async () => ({}) })],
    ["not found", async () => ({ ok: true, json: async () => ({ data: [card("A", [])], not_found: [{ name: "B" }] }) })],
    ["network error", async () => { throw new Error("offline"); }],
  ])("fails open (null) on %s and is retried later", async (_l, impl) => {
    vi.stubGlobal("fetch", vi.fn(impl));
    expect(await checkPartnerPair("A", "B")).toBeNull();
    await Promise.resolve();
    expect(await checkPartnerPair("A", "B")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
