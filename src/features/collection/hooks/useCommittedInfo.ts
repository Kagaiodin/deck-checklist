import { useCallback } from "react";
import type { Deck } from "../../../types/index";
import type { CommittedInfo } from "../../../types/collection";

/**
 * Returns a stable `getCommittedInfo(name)` function that sums how many
 * copies of a card (lowercase key) are committed across all decks, and in
 * how many distinct decks.
 *
 * The returned function is memoised with useCallback so it can safely be
 * passed as a react-virtuoso context prop without causing row re-renders.
 */
export function useCommittedInfo(decks: Deck[]): (name: string) => CommittedInfo {
  return useCallback(
    (name: string): CommittedInfo => {
      let total = 0;
      let deckCount = 0;
      for (const deck of decks) {
        const card = deck.cards.find(c => c.name.toLowerCase() === name);
        if (card) { total += card.quantity; deckCount++; }
      }
      return { total, deckCount };
    },
    [decks],
  );
}
