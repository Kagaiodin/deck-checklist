import type { Finish, TradeCard } from "../../types/trade";

export const FINISH_LABEL: Record<Finish, string> = { nonfoil: "Nonfoil", foil: "Foil", etched: "Etched" };

export const usd = (n: number | null): string =>
  n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** "just now", "3 min ago", "2 hr ago", "4 days ago". */
export function relativeAge(ts: number, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - ts) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Oldest price snapshot on the trade (the honest "how fresh is this" answer). Null when nothing is priced. */
export function oldestPriceAt(cards: TradeCard[]): number | null {
  let oldest: number | null = null;
  for (const c of cards) {
    if (c.priceFetchedAt === null) continue;
    if (oldest === null || c.priceFetchedAt < oldest) oldest = c.priceFetchedAt;
  }
  return oldest;
}

/** Collection keys are lowercased names; give them readable casing for display only. */
export function displayName(key: string): string {
  const small = new Set(["of", "the", "and", "in", "to", "for", "a", "an", "on"]);
  return key
    .split(" ")
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Clamps a typed percent to 0–90 with one decimal, as the mockups do. */
export const clampPct = (v: number): number =>
  Math.max(0, Math.min(90, Math.round((Number.isFinite(v) ? v : 0) * 10) / 10));
