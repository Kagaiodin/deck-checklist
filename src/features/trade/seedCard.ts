import type { Finish, TradeCard } from "../../types/trade";
import { basePriceFor } from "../../utils/tradePricing";
import { fetchPrices, priceKey, searchPrintings } from "../../utils/scryfallSearch";
import { displayName } from "./format";

/** A collection card handed to the Calculator (e.g. "Add to new trade" in the Binder). */
export interface TradeSeed {
  /** Lowercased Collection key. */
  name: string;
  set?: string;
  collectorNumber?: string;
  foil?: boolean;
}

/** Builds a priced "My offer" card (quantity 1) from a seed; unpriced if Scryfall can't be reached. */
export async function seedToTradeCard(seed: TradeSeed): Promise<Omit<TradeCard, "id">> {
  const finish: Finish = seed.foil ? "foil" : "nonfoil";
  let found;
  try {
    if (seed.set && seed.collectorNumber) {
      const prices = await fetchPrices([{ set: seed.set, collectorNumber: seed.collectorNumber }]);
      found = prices.get(priceKey({ set: seed.set, collectorNumber: seed.collectorNumber }));
    } else {
      // Order receipts record quantity only: fall back to the newest printing of that name.
      // The search is fuzzy, so only accept the same card (or a double-faced card whose front face matches).
      const want = seed.name.toLowerCase();
      found = (await searchPrintings(seed.name)).find((p) => {
        const n = p.name.toLowerCase();
        return n === want || n.startsWith(`${want} //`);
      });
    }
  } catch {
    found = undefined;
  }
  return {
    name: found?.name ?? displayName(seed.name),
    scryfallId: found?.scryfallId ?? "",
    set: found?.set ?? seed.set ?? "",
    collectorNumber: found?.collectorNumber ?? seed.collectorNumber ?? "",
    finish,
    condition: "NM",
    quantity: 1,
    imageUrl: found?.imageUrl,
    basePrice: found ? basePriceFor(found.prices, finish) : null,
    priceFetchedAt: found ? Date.now() : null,
    source: "collection",
  };
}
