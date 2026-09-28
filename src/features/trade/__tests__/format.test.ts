import { describe, it, expect } from "vitest";
import { usd, relativeAge, oldestPriceAt, displayName, clampPct } from "../format";
import type { TradeCard } from "../../../types/trade";

const card = (priceFetchedAt: number | null): TradeCard => ({
  id: String(priceFetchedAt), name: "X", scryfallId: "", set: "cmd", collectorNumber: "1",
  finish: "nonfoil", condition: "NM", quantity: 1, basePrice: 1, priceFetchedAt, source: "search",
});

describe("usd", () => {
  it("formats dollars and shows a dash for no price", () => {
    expect(usd(1234.5)).toBe("$1,234.50");
    expect(usd(0)).toBe("$0.00");
    expect(usd(null)).toBe("—");
  });
});

describe("relativeAge", () => {
  const now = 1_000_000_000;
  it.each([
    [0, "just now"],
    [29_000, "just now"],
    [3 * 60_000, "3 min ago"],
    [59 * 60_000, "59 min ago"],
    [2 * 3_600_000, "2 hr ago"],
    [24 * 3_600_000, "1 day ago"],
    [3 * 24 * 3_600_000, "3 days ago"],
  ])("%d ms ago → %s", (ago, text) => {
    expect(relativeAge(now - ago, now)).toBe(text);
  });
  it("never goes negative for a future timestamp", () => {
    expect(relativeAge(now + 5000, now)).toBe("just now");
  });
});

describe("oldestPriceAt", () => {
  it("returns the earliest snapshot, ignoring unpriced cards", () => {
    expect(oldestPriceAt([card(300), card(null), card(100), card(200)])).toBe(100);
  });
  it("is null when nothing has a snapshot", () => {
    expect(oldestPriceAt([])).toBeNull();
    expect(oldestPriceAt([card(null)])).toBeNull();
  });
});

describe("displayName", () => {
  it("title-cases collection keys and keeps small words lower", () => {
    expect(displayName("sol ring")).toBe("Sol Ring");
    expect(displayName("fable of the mirror-breaker")).toBe("Fable of the Mirror-breaker");
    expect(displayName("the one ring")).toBe("The One Ring");
  });
});

describe("clampPct", () => {
  it("clamps to 0–90 with one decimal and tolerates junk", () => {
    expect(clampPct(12.34)).toBe(12.3);
    expect(clampPct(-5)).toBe(0);
    expect(clampPct(140)).toBe(90);
    expect(clampPct(NaN)).toBe(0);
  });
});
