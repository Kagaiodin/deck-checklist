import { useState, useMemo } from "react";
import type { Collection, CollectionPrinting } from "../../../types/index";
import type { CollectionSortKey } from "../../../types/collection";

interface SortedEntry {
  name: string;
  printings: CollectionPrinting[];
  total: number;
}

interface UseCollectionSortResult {
  collectionSort: CollectionSortKey;
  setCollectionSort: (key: CollectionSortKey) => void;
  collectionFiltered: SortedEntry[];
}

/**
 * Applies search-term filtering and sorting to the raw collection.
 * Returns the sorted+filtered entry array plus the sort state controls.
 */
export function useCollectionSort(
  collection: Collection,
  collectionSearch: string,
): UseCollectionSortResult {
  const [collectionSort, setCollectionSort] = useState<CollectionSortKey>("name-asc");

  const collectionFiltered = useMemo<SortedEntry[]>(() => {
    const term = collectionSearch.toLowerCase();
    return Object.entries(collection)
      .filter(([name]) => !term || name.includes(term))
      .map(([name, rawPrintings]) => {
        const printings = Array.isArray(rawPrintings) ? rawPrintings : [];
        return { name, printings, total: printings.reduce((s, p) => s + p.quantity, 0) };
      })
      .sort((a, b) => {
        if (collectionSort === "name-asc")  return a.name.localeCompare(b.name);
        if (collectionSort === "name-desc") return b.name.localeCompare(a.name);
        if (collectionSort === "qty-desc")  return b.total - a.total || a.name.localeCompare(b.name);
        return a.total - b.total || a.name.localeCompare(b.name); // qty-asc
      });
  }, [collection, collectionSearch, collectionSort]);

  return { collectionSort, setCollectionSort, collectionFiltered };
}
