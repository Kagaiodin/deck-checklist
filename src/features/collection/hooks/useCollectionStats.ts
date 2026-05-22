import { useMemo } from "react";
import type { Collection } from "../../../types/index";
import type { CommittedInfo } from "../../../types/collection";

interface CollectionStats {
  totalCards: number;
  uniqueCards: number;
  foilTotal: number;
  inDecksCount: number;
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
    let foilTotal = 0;
    let inDecksCount = 0;

    for (const [name, printings] of entries) {
      if (!Array.isArray(printings)) continue;
      for (const p of printings) {
        totalCards += p.quantity;
        if (p.foil) foilTotal += p.quantity;
      }
      if (getCommittedInfo(name).total > 0) inDecksCount++;
    }

    return { totalCards, uniqueCards: entries.length, foilTotal, inDecksCount };
  }, [collection, getCommittedInfo]);
}
