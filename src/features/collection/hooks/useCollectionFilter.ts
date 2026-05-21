import { useMemo } from "react";
import type { CollectionPrinting } from "../../../types/index";
import type { CollectionFilterKey, CommittedInfo } from "../../../types/collection";

interface Entry {
  name: string;
  printings: CollectionPrinting[];
  total: number;
}

interface PillCounts {
  all: number;
  "in-deck": number;
  free: number;
  foils: number;
  duplicates: number;
}

interface UseCollectionFilterResult {
  collectionPillFiltered: Entry[];
  pillCounts: PillCounts;
  inDecksCount: number;
}

/**
 * Applies the active pill filter on top of the already-search-filtered+sorted
 * entry list, and computes counts for all pills simultaneously.
 */
export function useCollectionFilter(
  collectionFiltered: Entry[],
  collectionFilter: CollectionFilterKey,
  deckCardNames: Set<string>,
  getCommittedInfo: (name: string) => CommittedInfo,
): UseCollectionFilterResult {
  return useMemo(() => {
    const inDeckPred  = ({ name }: Entry) => deckCardNames.has(name);
    const freePred    = ({ name, total }: Entry) => total - getCommittedInfo(name).total > 0;
    const foilsPred   = ({ printings }: Entry) => printings.some(p => p.foil);
    const dupPred     = ({ total }: Entry) => total > 4;

    const predicates: Record<CollectionFilterKey, (e: Entry) => boolean> = {
      all:         () => true,
      "in-deck":   inDeckPred,
      free:        freePred,
      foils:       foilsPred,
      duplicates:  dupPred,
    };

    const collectionPillFiltered =
      collectionFilter === "all"
        ? collectionFiltered
        : collectionFiltered.filter(predicates[collectionFilter]);

    const pillCounts: PillCounts = {
      all:        collectionFiltered.length,
      "in-deck":  collectionFiltered.filter(inDeckPred).length,
      free:       collectionFiltered.filter(freePred).length,
      foils:      collectionFiltered.filter(foilsPred).length,
      duplicates: collectionFiltered.filter(dupPred).length,
    };

    return {
      collectionPillFiltered,
      pillCounts,
      inDecksCount: pillCounts["in-deck"],
    };
  }, [collectionFiltered, collectionFilter, deckCardNames, getCommittedInfo]);
}
