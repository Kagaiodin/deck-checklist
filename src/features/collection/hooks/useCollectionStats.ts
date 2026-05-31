import { useMemo } from "react";
import type { Collection } from "../../../types/index";
import type { CommittedInfo } from "../../../types/collection";

interface CollectionStats {
  totalCards: number;
  uniqueCards: number;
  deckCardTotal: number;
}

/**
 * Derives the four stats-strip values from the raw collection state and a
 * pre-computed committed-info function.
 */
export function useCollectionStats(
  collection: Collection,
  getCommittedInfo: (name: string) => CommittedInfo,
): CollectionStats {
  return useMemo(() => {
    const entries = Object.entries(collection);
    let totalCards = 0;
    let deckCardTotal = 0;

    for (const [name, printings] of entries) {
      if (!Array.isArray(printings)) continue;
      for (const p of printings) {
        totalCards += p.quantity;
      }
      deckCardTotal += getCommittedInfo(name).total;
    }

    return { totalCards, uniqueCards: entries.length, deckCardTotal };
  }, [collection, getCommittedInfo]);
}
