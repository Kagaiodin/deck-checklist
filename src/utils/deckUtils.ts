import type { Deck } from "../types/index";

/**
 * Derives the color identity of a deck from its cards' color fields.
 * Returns colors in WUBRG order; only includes colors actually present.
 */
export function getDeckColorIdentity(deck: Deck): string[] {
  const seen = new Set<string>();
  for (const c of deck.cards) {
    for (const col of c.color) {
      if ("WUBRG".includes(col) && col.length === 1) seen.add(col);
    }
  }
  return ["W", "U", "B", "R", "G"].filter(c => seen.has(c));
}

/**
 * Returns a human-readable relative date string from a Unix timestamp.
 * Accepts an optional `now` argument (milliseconds) for deterministic testing.
 */
export function formatRelativeDate(ts: number, now = Date.now()): string {
  const days = Math.floor((now - ts) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Returns the display hostname from a deck URL, stripping www.
 */
export function getDeckDomain(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
