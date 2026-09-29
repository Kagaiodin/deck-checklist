import type { Condition, Finish, Trade, TradeCard, TradeSettings, TradeSide } from "../types/trade";
import { CONDITIONS } from "../types/trade";
import { lineTotal, sideTotals, unitPrice, fairness } from "./tradePricing";

export const SHARE_VERSION = "v1";
/** Build a link only when the full URL is at most this long; otherwise offer "Copy as text". */
export const MAX_SHARE_URL_LENGTH = 4000;

interface WireCard {
  n: string; s: string; c: string; f: Finish; cd: Condition; q: number;
  b: number | null; m?: number; d?: number;
}
interface WireSide { k: WireCard[]; $: number[]; d?: number }
interface WirePayload { v: 1; t: number; a: WireSide; b: WireSide; s: TradeSettings }

export type DecodeResult =
  | { ok: true; trade: Trade; snapshotAt: number }
  | { ok: false; reason: "version" | "malformed" };

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const writer = stream.writable.getWriter();
  // Not awaited: the write only settles once the readable side is consumed below.
  // On corrupt input it rejects too, but the reader below throws first, so ignore it here.
  writer.write(data as BufferSource).then(() => writer.close()).catch(() => {});
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

const cardToWire = (c: TradeCard): WireCard => ({
  n: c.name, s: c.set, c: c.collectorNumber, f: c.finish, cd: c.condition, q: c.quantity,
  b: c.basePrice,
  ...(c.manualPrice !== undefined && { m: c.manualPrice }),
  ...(c.discountOverridePct !== undefined && { d: c.discountOverridePct }),
});

const sideToWire = (s: TradeSide): WireSide => ({
  k: s.cards.map(cardToWire),
  $: s.cash.map((c) => c.amount),
  ...(s.discountOverridePct !== undefined && { d: s.discountOverridePct }),
});

/** Creator's `mine` is encoded as side `a`; there is no baked-in "mine"/"theirs" label. */
export async function encodeTrade(trade: Trade, now = Date.now()): Promise<string> {
  const payload: WirePayload = {
    v: 1, t: now, a: sideToWire(trade.mine), b: sideToWire(trade.theirs), s: trade.settings,
  };
  const bytes = await pipe(new TextEncoder().encode(JSON.stringify(payload)), new CompressionStream("deflate"));
  return `${SHARE_VERSION}.${toBase64Url(bytes)}`;
}

export function buildShareUrl(origin: string, payload: string): string {
  return `${origin}/#trade=${payload}`;
}

export const isShareUrlTooLong = (url: string) => url.length > MAX_SHARE_URL_LENGTH;

/** Reads a `#trade=...` hash (with or without the leading `#`). Null when the hash isn't a trade link. */
export function extractPayload(hash: string): string | null {
  const m = /^#?trade=(.+)$/.exec(hash);
  return m ? m[1] : null;
}

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

function wireToCard(w: WireCard, snapshotAt: number): TradeCard {
  if (
    typeof w.n !== "string" || typeof w.s !== "string" || typeof w.c !== "string" ||
    !["nonfoil", "foil", "etched"].includes(w.f) || !CONDITIONS.includes(w.cd) ||
    !isNum(w.q) || w.q < 1 || (w.b !== null && !isNum(w.b)) ||
    (w.m !== undefined && !isNum(w.m)) || (w.d !== undefined && !isNum(w.d))
  ) throw new Error("bad card");
  return {
    id: crypto.randomUUID(), name: w.n, scryfallId: "", set: w.s, collectorNumber: w.c,
    finish: w.f, condition: w.cd, quantity: w.q, basePrice: w.b, priceFetchedAt: snapshotAt,
    manualPrice: w.m, discountOverridePct: w.d, source: "search",
  };
}

function wireToSide(w: WireSide, snapshotAt: number): TradeSide {
  if (!Array.isArray(w.k) || !Array.isArray(w.$) || !w.$.every(isNum) || (w.d !== undefined && !isNum(w.d)))
    throw new Error("bad side");
  return {
    cards: w.k.map((c) => wireToCard(c, snapshotAt)),
    cash: w.$.map((amount) => ({ id: crypto.randomUUID(), amount })),
    discountOverridePct: w.d,
  };
}

/**
 * Decodes a `v1.<payload>` string. The version prefix is checked before any decompression,
 * so a future format is reported as "version" rather than attempted. Perspective flips on open:
 * the creator's `mine` (side a) becomes the opener's `theirs`. Never throws.
 */
export async function decodeTrade(payload: string): Promise<DecodeResult> {
  const dot = payload.indexOf(".");
  if (dot < 1) return { ok: false, reason: "malformed" };
  if (payload.slice(0, dot) !== SHARE_VERSION) {
    return /^v\d+$/.test(payload.slice(0, dot)) ? { ok: false, reason: "version" } : { ok: false, reason: "malformed" };
  }
  try {
    const bytes = await pipe(fromBase64Url(payload.slice(dot + 1)), new DecompressionStream("deflate"));
    const p = JSON.parse(new TextDecoder().decode(bytes)) as WirePayload;
    if (p.v !== 1 || !isNum(p.t) || !isNum(p.s?.discountPct) || !isNum(p.s?.tolerancePct)) throw new Error("bad payload");
    return {
      ok: true,
      snapshotAt: p.t,
      trade: {
        mine: wireToSide(p.b, p.t),
        theirs: wireToSide(p.a, p.t),
        settings: { discountPct: p.s.discountPct, tolerancePct: p.s.tolerancePct },
        readOnly: true,
      },
    };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

const usd = (n: number) => `$${n.toFixed(2)}`;

/** Plain-text summary for Discord/chat, and the fallback when the link is too long. One-way. */
export function tradeToText(trade: Trade): string {
  const { settings } = trade;
  const block = (label: string, side: TradeSide) => {
    const lines = side.cards.map((c) => {
      const u = unitPrice(c, side, settings);
      const finish = c.finish === "nonfoil" ? "" : ` ${c.finish}`;
      const price = u === null ? "no price" : usd(lineTotal(c, side, settings));
      return `${c.quantity}x ${c.name} (${c.set.toUpperCase()} ${c.collectorNumber}${finish}, ${c.condition}) — ${price}`;
    });
    side.cash.forEach((c) => lines.push(`Cash — ${usd(c.amount)}`));
    if (lines.length === 0) lines.push("(nothing)");
    return [`${label} (${usd(sideTotals(side, settings).total)}):`, ...lines].join("\n");
  };
  const m = sideTotals(trade.mine, settings).total;
  const t = sideTotals(trade.theirs, settings).total;
  const f = fairness(m, t, settings.tolerancePct);
  const verdict =
    f.favors === "even" ? "Even trade" : `${f.band[0].toUpperCase()}${f.band.slice(1)} — ${usd(f.balanceHint)} apart`;
  return [
    block("I give", trade.mine),
    "",
    block("I get", trade.theirs),
    "",
    `${verdict} (prices at TCGplayer −${settings.discountPct}%)`,
  ].join("\n");
}
