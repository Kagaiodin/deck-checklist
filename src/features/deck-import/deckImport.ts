// Deck import (GLOSSARY): turn a Decklist into cards, looked up on Scryfall and tagged from the Collection.
// No React here: callers pass the Collection they read at the moment they act.
import type { Card, Collection, ErrorQueueItem } from "../../types/index";
import { parseDecklist } from "../../utils/parser";
import { validateDecklist, type ValidationProgress } from "../../utils/validator";
import { applyCollectionToCards } from "../../utils/csvParser";

export const EMPTY_DECKLIST_MESSAGE = "No valid card lines found. Use the format: 4 Lightning Bolt";

export interface DecklistResult {
  cards: Card[];
  errors: ErrorQueueItem[];
}

/**
 * Looks up every line of a Decklist and tags the cards from `collection`.
 * Lines Scryfall can't match come back as Deck errors. Throws when no line parses.
 */
export async function importDecklist(
  decklist: string,
  { collection, onProgress }: { collection: () => Collection; onProgress?: (p: ValidationProgress) => void },
): Promise<DecklistResult> {
  const parsed = parseDecklist(decklist);
  if (parsed.length === 0) throw new Error(EMPTY_DECKLIST_MESSAGE);
  const { cards, errors } = await validateDecklist(parsed, onProgress);
  // Read the Collection after the lookup, so a change made while it ran is seen.
  return { cards: applyCollectionToCards(cards, collection()), errors };
}

/** Looks up one card and tags it from `collection`; null when Scryfall has no match. */
export async function lookupCard(
  { name, count }: { name: string; count: number },
  { collection }: { collection: () => Collection },
): Promise<Card | null> {
  const { cards } = await validateDecklist([{ count, name }]);
  if (cards.length === 0) return null;
  const [tagged] = applyCollectionToCards([cards[0]], collection());
  return tagged;
}

// ── Archidekt ─────────────────────────────────────────────────────────────────

/** The deck id in an Archidekt deck URL, or null when the URL isn't one. */
export function archidektDeckId(url: string): string | null {
  const match = url.match(/archidekt\.com\/decks\/(\d+)/i);
  return match ? match[1] : null;
}

interface ArchidektDeck {
  name?: string;
  cards: { quantity: number; categories?: string[] | null; card: { oracleCard: { name: string } } }[];
}

/** An Archidekt deck as a Decklist, leaving out the Maybeboard. */
export function archidektToDecklist(deck: ArchidektDeck): { decklist: string; name: string } {
  const decklist = deck.cards
    .filter(c => !c.categories?.includes("Maybeboard"))
    .map(c => `${c.quantity} ${c.card.oracleCard.name}`)
    .join("\n");
  return { decklist, name: deck.name ?? "" };
}

/** Fetches a public Archidekt deck through the Worker's proxy (`/api/archidekt`). */
export async function fetchArchidektDecklist(deckId: string): Promise<{ decklist: string; name: string }> {
  const res = await fetch(`/api/archidekt?id=${deckId}`);
  if (!res.ok) throw new Error(`Archidekt returned ${res.status} — is the deck public?`);
  return archidektToDecklist(await res.json() as ArchidektDeck);
}
