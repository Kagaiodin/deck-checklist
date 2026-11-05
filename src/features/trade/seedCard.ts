import type { Finish, TradeCard } from "../../types/trade";
import { basePriceFor } from "../../utils/tradePricing";
import { fetchPrices, priceKey, searchPrintings, type Printing } from "../../utils/scryfallSearch";
import { displayName } from "./format";

/**
 * Collection rows only record foil yes/no (the CSV import folds "etched" into foil), so an
 * etched copy arrives as `foil: true`. Use the printing's finishes to tell them apart: a
 * printing that is only sold etched must be priced as etched.
 */
function seedFinish(foil: boolean | undefined, finishes: Finish[] | undefined): Finish {
  if (!foil) return "nonfoil";
  if (finishes && !finishes.includes("foil") && finishes.includes("etched")) return "etched";
  return "foil";
}

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
  let found: Printing | undefined;
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
  const finish = seedFinish(seed.foil, found?.finishes);
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
