import { describe, it, expect } from "vitest";
import {
  encodeTrade,
  decodeTrade,
  buildShareUrl,
  extractPayload,
  isShareUrlTooLong,
  tradeToText,
  MAX_SHARE_URL_LENGTH,
} from "../tradeShare";
import { type Trade, type TradeCard } from "../../types/trade";

const card = (over: Partial<TradeCard> = {}): TradeCard => ({
  id: "c1", name: "Sol Ring", scryfallId: "s1", set: "cmd", collectorNumber: "1",
  finish: "nonfoil", condition: "NM", quantity: 2, basePrice: 10, priceFetchedAt: 0,
  source: "collection", ...over,
});
const trade = (): Trade => ({
  mine: { cards: [card({ manualPrice: 12, discountOverridePct: 5 })], cash: [{ id: "x", amount: 3 }], discountOverridePct: 15 },
  theirs: { cards: [card({ name: "Counterspell", finish: "foil", condition: "LP", basePrice: null })], cash: [] },
  settings: { discountPct: 12, tolerancePct: 8 },
  readOnly: false,
});

describe("encode/decode", () => {
  it("round-trips and flips perspective for the opener", async () => {
    const t = trade();
    const payload = await encodeTrade(t, 1234);
    expect(payload.startsWith("v1.")).toBe(true);
    const res = await decodeTrade(payload);
    if (!res.ok) throw new Error("expected ok");
    expect(res.snapshotAt).toBe(1234);
    expect(res.trade.readOnly).toBe(true);
    // creator's mine → opener's theirs
    expect(res.trade.theirs.cards[0]).toMatchObject({ name: "Sol Ring", quantity: 2, manualPrice: 12, discountOverridePct: 5, basePrice: 10 });
    expect(res.trade.theirs.cash.map((c) => c.amount)).toEqual([3]);
    expect(res.trade.theirs.discountOverridePct).toBe(15);
    expect(res.trade.mine.cards[0]).toMatchObject({ name: "Counterspell", finish: "foil", condition: "LP", basePrice: null });
    expect(res.trade.settings).toEqual({ discountPct: 12, tolerancePct: 8 });
  });

  it("does not include images or scryfall ids", async () => {
    const payload = await encodeTrade({ ...trade(), mine: { cards: [card({ imageUrl: "http://img", scryfallId: "abc-secret" })], cash: [] } });
    const res = await decodeTrade(payload);
    if (!res.ok) throw new Error("expected ok");
    expect(res.trade.theirs.cards[0].imageUrl).toBeUndefined();
    expect(res.trade.theirs.cards[0].scryfallId).toBe("");
  });

  it("reports an unknown version without decoding", async () => {
    expect(await decodeTrade("v2.anything")).toEqual({ ok: false, reason: "version" });
  });

  it.each(["", "nodot", ".x", "v1.", "v1.!!!notbase64", "v1.AAAA", "x1.abc"])("treats %j as malformed", async (p) => {
    expect(await decodeTrade(p)).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("links", () => {
  it("builds from the given origin and extracts the payload", () => {
    const url = buildShareUrl("https://example.dev", "v1.abc");
    expect(url).toBe("https://example.dev/#trade=v1.abc");
    expect(extractPayload("#trade=v1.abc")).toBe("v1.abc");
    expect(extractPayload("trade=v1.abc")).toBe("v1.abc");
    expect(extractPayload("#other")).toBeNull();
  });

  it("flags URLs over the size limit", () => {
    expect(isShareUrlTooLong("x".repeat(MAX_SHARE_URL_LENGTH))).toBe(false);
    expect(isShareUrlTooLong("x".repeat(MAX_SHARE_URL_LENGTH + 1))).toBe(true);
  });

  it("a typical 30-card trade fits under the limit", async () => {
    const cards = Array.from({ length: 15 }, (_, i) =>
      card({ id: String(i), name: `Some Reasonably Long Card Name ${i}`, set: "mh3", collectorNumber: String(100 + i), basePrice: 1.23 + i })
    );
    const t: Trade = { ...trade(), mine: { cards, cash: [] }, theirs: { cards, cash: [] } };
    const url = buildShareUrl("https://fetchlist.example.workers.dev", await encodeTrade(t));
    expect(isShareUrlTooLong(url)).toBe(false);
  });
});

describe("tradeToText", () => {
  it("summarises both sides, cash, and a verdict", () => {
    const text = tradeToText(trade());
    expect(text).toContain("I give");
    expect(text).toContain("2x Sol Ring (CMD 1, NM)");
    expect(text).toContain("Cash — $3.00");
    expect(text).toContain("2x Counterspell (CMD 1 foil, LP) — no price");
    expect(text).toContain("prices at TCGplayer −12%");
  });
  it("handles empty sides", () => {
    const t = { ...trade(), mine: { cards: [], cash: [] }, theirs: { cards: [], cash: [] } };
    expect(tradeToText(t)).toContain("(nothing)");
    expect(tradeToText(t)).toContain("Even trade");
  });
});
