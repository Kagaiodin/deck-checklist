import type { CollectionPrinting } from "../types/index";
import type { Finish, TradeCard } from "../types/trade";

/** What makes a Printing a Printing: everything but the quantity. */
export type PrintingIdentity = Pick<CollectionPrinting, "set" | "collectorNumber" | "foil">;

/** The stored form of a set code: trimmed and uppercase. Blank means no set. */
export function normalizeSet(set: string | undefined): string | undefined {
  return set?.trim().toUpperCase() || undefined;
}

/** The same Printing: set (any case), collector number and foil match. Quantity doesn't count. */
export function samePrinting(a: PrintingIdentity, b: PrintingIdentity): boolean {
  return normalizeSet(a.set) === normalizeSet(b.set)
    && a.collectorNumber === b.collectorNumber
    && (a.foil ?? false) === (b.foil ?? false);
}

/** The Collection keeps foil as a yes/no, so etched counts as foil. */
export const isFoilFinish = (finish: Finish) => finish !== "nonfoil";

/** The Printing a trade card corresponds to in the Collection. */
export function printingOf(card: Pick<TradeCard, "set" | "collectorNumber" | "finish">): PrintingIdentity {
  return { set: normalizeSet(card.set), collectorNumber: card.collectorNumber, foil: isFoilFinish(card.finish) };
}
