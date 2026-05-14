import type { Card, ErrorQueueItem } from "../types/index";
import { getFrontFaceName, isDualFace } from "./dualface";

interface ScryfallCardFace {
  name: string;
  colors?: string[];
  type_line?: string;
}

interface ScryfallCard {
  id: string;
  name: string;
  colors?: string[];
  color_identity: string[];
  type_line: string;
  card_faces?: ScryfallCardFace[];
  set: string;
  rarity: "common" | "uncommon" | "rare" | "mythic" | "special" | "bonus";
}

interface ScryfallNotFound {
  object: "error";
  details?: string;
}

interface ScryfallCollectionResponse {
  data: ScryfallCard[];
  not_found: { name: string }[];
}

const SCRYFALL_BATCH_SIZE = 75;
const SCRYFALL_COLLECTION_URL = "https://api.scryfall.com/cards/collection";
const SCRYFALL_NAMED_URL = "https://api.scryfall.com/cards/named";

async function fetchFuzzy(name: string): Promise<ScryfallCard | null> {
  const res = await fetch(`${SCRYFALL_NAMED_URL}?fuzzy=${encodeURIComponent(name)}`);
  if (!res.ok) return null;
  return res.json() as Promise<ScryfallCard>;
}

async function fetchBatch(
  identifiers: { name: string }[]
): Promise<ScryfallCollectionResponse> {
  const res = await fetch(SCRYFALL_COLLECTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifiers })
  });
  if (!res.ok) {
    const err = (await res.json()) as ScryfallNotFound;
    throw new Error(err.details ?? `Scryfall error ${res.status}`);
  }
  return res.json() as Promise<ScryfallCollectionResponse>;
}

function scryfallCardToCard(sc: ScryfallCard, quantity: number): Card {
  const dual = isDualFace(sc.card_faces);
  const colors = dual
    ? (sc.card_faces![0].colors ?? sc.color_identity)
    : (sc.colors ?? sc.color_identity);
  const typeLineSrc = dual ? (sc.card_faces![0].type_line ?? sc.type_line) : sc.type_line;
  const type = typeLineSrc.split("—")[0].trim();

  return {
    id: sc.id,
    name: dual ? getFrontFaceName(sc.name) : sc.name,
    quantity,
    acquired: false,
    color: colors,
    type,
    set: sc.set.toUpperCase(),
    rarity: sc.rarity,
  };
}

export interface ValidationResult {
  cards: Card[];
  errors: ErrorQueueItem[];
}

export interface ValidationProgress {
  total: number;
  validated: number;
}

export async function validateDecklist(
  parsed: { count: number; name: string }[],
  onProgress?: (progress: ValidationProgress) => void
): Promise<ValidationResult> {
  const allCards: Card[] = [];
  const allErrors: ErrorQueueItem[] = [];

  const quantityMap = new Map<string, number>();
  for (const { count, name } of parsed) {
    quantityMap.set(name.toLowerCase(), (quantityMap.get(name.toLowerCase()) ?? 0) + count);
  }

  // Deduplicate: send each unique card name once, quantities are tracked in quantityMap
  const seen = new Set<string>();
  const identifiers: { name: string }[] = [];
  for (const { name } of parsed) {
    if (!seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      identifiers.push({ name });
    }
  }
  const total = identifiers.length;
  let validated = 0;

  for (let i = 0; i < identifiers.length; i += SCRYFALL_BATCH_SIZE) {
    const batch = identifiers.slice(i, i + SCRYFALL_BATCH_SIZE);
    const result = await fetchBatch(batch);

    for (const sc of result.data) {
      const matchName = isDualFace(sc.card_faces)
        ? getFrontFaceName(sc.name)
        : sc.name;
      const quantity = quantityMap.get(matchName.toLowerCase()) ?? 1;
      allCards.push(scryfallCardToCard(sc, quantity));
    }

    for (const nf of result.not_found) {
      const fuzzyCard = await fetchFuzzy(nf.name);
      if (fuzzyCard) {
        const quantity = quantityMap.get(nf.name.toLowerCase()) ?? 1;
        const card = scryfallCardToCard(fuzzyCard, quantity);
        card.inputName = nf.name;
        allCards.push(card);
      } else {
        allErrors.push({
          originalName: nf.name,
          searchName: nf.name,
          resolved: false
        });
      }
    }

    validated += batch.length;
    onProgress?.({ total, validated });

    // Respect Scryfall's rate limit between batches
    if (i + SCRYFALL_BATCH_SIZE < identifiers.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  return { cards: allCards, errors: allErrors };
}
