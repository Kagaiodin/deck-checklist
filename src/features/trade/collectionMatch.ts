import type { Collection, CollectionPrinting, Deck } from "../../types/index";
import type { Finish, TradeCard } from "../../types/trade";
import type { OwnedInfo } from "./components/TradeCardRow";

const isFoilFinish = (f: Finish) => f !== "nonfoil";

/**
 * How many copies of this exact printing + finish the collection holds, and how many copies of the
 * card (by name) are committed to decks. Null when the collection has no matching printing.
 *
 * Deck cards carry no collector number or finish, so "in decks" can only match on name — the same
 * basis the Collection tab uses for its own "in decks" count.
 */
export function ownedFor(collection: Collection, decks: Deck[], card: Pick<TradeCard, "name" | "set" | "collectorNumber" | "finish">): OwnedInfo | null {
  const key = card.name.toLowerCase();
  const owned = (collection[key] ?? [])
    .filter((p) =>
      p.set?.toLowerCase() === card.set.toLowerCase() &&
      p.collectorNumber === card.collectorNumber &&
      Boolean(p.foil) === isFoilFinish(card.finish)
    )
    .reduce((n, p) => n + p.quantity, 0);
  if (owned === 0) return null;

  let inDecks = 0;
  for (const deck of decks) {
    for (const c of deck.cards) if (c.acquired && c.name.toLowerCase() === key) inDecks += c.quantity;
  }
  return { owned, inDecks };
}

export interface CollectionEntry {
  /** Stable per-printing key for selection state. */
  id: string;
  /** Lowercased card name, as stored in the collection. */
  name: string;
  printing: CollectionPrinting;
}

/** One entry per printing, sorted by name, optionally filtered by a name substring. */
export function collectionEntries(collection: Collection, filter = ""): CollectionEntry[] {
  const f = filter.trim().toLowerCase();
  const out: CollectionEntry[] = [];
  for (const name of Object.keys(collection).sort()) {
    if (f && !name.includes(f)) continue;
    collection[name].forEach((printing, i) => {
      if (printing.quantity > 0) out.push({ id: `${name}|${printing.set ?? ""}|${printing.collectorNumber ?? ""}|${printing.foil ? "f" : "n"}|${i}`, name, printing });
    });
  }
  return out;
}
