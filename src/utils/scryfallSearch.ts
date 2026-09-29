import type { Finish } from "../types/trade";
import type { ScryfallPrices } from "./tradePricing";

const BASE = "https://api.scryfall.com";
const BATCH_SIZE = 75;

interface ScryfallImageUris { small?: string; normal?: string }

interface ScryfallPrintingRaw {
  id: string;
  name: string;
  set: string;
  set_name: string;
  collector_number: string;
  finishes?: Finish[];
  prices?: ScryfallPrices;
  image_uris?: ScryfallImageUris;
  card_faces?: { image_uris?: ScryfallImageUris }[];
}

/** A printing as the trade screen needs it (no trade state yet). */
export interface Printing {
  scryfallId: string;
  name: string;
  set: string;
  setName: string;
  collectorNumber: string;
  finishes: Finish[];
  imageUrl?: string;
  prices: ScryfallPrices;
}

export function toPrinting(raw: ScryfallPrintingRaw): Printing {
  const img = raw.image_uris ?? raw.card_faces?.[0]?.image_uris;
  return {
    scryfallId: raw.id,
    name: raw.name,
    set: raw.set,
    setName: raw.set_name,
    collectorNumber: raw.collector_number,
    finishes: raw.finishes?.length ? raw.finishes : ["nonfoil"],
    imageUrl: img?.small ?? img?.normal,
    prices: raw.prices ?? {},
  };
}

/** Card-name autocomplete. Empty for short input; empty on any failure (best-effort UI). */
export async function autocomplete(query: string, signal?: AbortSignal): Promise<string[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await fetch(`${BASE}/cards/autocomplete?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) return [];
  const body = (await res.json()) as { data?: string[] };
  return body.data ?? [];
}

/** Every printing of an exact card name, newest first. Empty when nothing matches (Scryfall 404). */
export async function searchPrintings(name: string, signal?: AbortSignal): Promise<Printing[]> {
  const q = encodeURIComponent(`!"${name.replace(/"/g, "")}"`);
  const res = await fetch(`${BASE}/cards/search?q=${q}&unique=prints&order=released`, { signal });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Scryfall error ${res.status}`);
  const body = (await res.json()) as { data?: ScryfallPrintingRaw[] };
  return (body.data ?? []).map(toPrinting);
}

export interface PriceLookup {
  /** scryfallId when known, otherwise set + collector number (share-link cards carry no id). */
  scryfallId?: string;
  set: string;
  collectorNumber: string;
}

export const priceKey = (l: PriceLookup) => l.scryfallId || `${l.set.toLowerCase()}:${l.collectorNumber}`;

/**
 * Batch-fetches current prices via POST /cards/collection, 75 per request.
 * Returns a map keyed by `priceKey`. Batches that fail are simply absent from the map so the
 * caller can leave the prior price and mark those rows stale.
 */
export async function fetchPrices(lookups: PriceLookup[]): Promise<Map<string, Printing>> {
  const out = new Map<string, Printing>();
  for (let i = 0; i < lookups.length; i += BATCH_SIZE) {
    const chunk = lookups.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(`${BASE}/cards/collection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifiers: chunk.map((l) =>
            l.scryfallId ? { id: l.scryfallId } : { set: l.set.toLowerCase(), collector_number: l.collectorNumber }
          ),
        }),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { data?: ScryfallPrintingRaw[] };
      for (const raw of body.data ?? []) {
        const p = toPrinting(raw);
        out.set(p.scryfallId, p);
        out.set(`${p.set.toLowerCase()}:${p.collectorNumber}`, p);
      }
    } catch {
      /* leave this batch absent */
    }
    if (i + BATCH_SIZE < lookups.length) await new Promise((r) => setTimeout(r, 100));
  }
  return out;
}
