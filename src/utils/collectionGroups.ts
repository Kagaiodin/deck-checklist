import type { CollectionPrinting } from "../types/index";

interface Entry {
  name: string;
  printings: CollectionPrinting[];
  total: number;
}

/** One card's printings within a single set group. */
export interface SetGroupRow {
  name: string;
  /** Only the printings that belong to this group's set. */
  printings: CollectionPrinting[];
  /** Index of each shown printing in the card's full printings array. */
  indices: number[];
  total: number;
}

export interface SetGroup {
  /** Uppercased set code, or null for printings with no set. */
  set: string | null;
  /** Unique card names in the group. */
  cards: number;
  /** Total copies in the group. */
  copies: number;
  rows: SetGroupRow[];
}

function compareCn(a?: string, b?: string): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, undefined, { numeric: true });
}

/**
 * Groups collection entries by set code. A card owned in several sets appears
 * once per set. Groups sort by code with the no-set group last; rows within a
 * group sort by collector number, falling back to name.
 */
export function groupCollectionBySet(
  entries: Entry[],
  printingFilter: (p: CollectionPrinting) => boolean = () => true,
): SetGroup[] {
  const bySet = new Map<string | null, Map<string, SetGroupRow & { cn?: string }>>();

  for (const { name, printings } of entries) {
    printings.forEach((p, idx) => {
      if (!printingFilter(p)) return;
      const set = p.set?.trim().toUpperCase() || null;
      let rows = bySet.get(set);
      if (!rows) { rows = new Map(); bySet.set(set, rows); }
      let row = rows.get(name);
      if (!row) {
        row = { name, printings: [], indices: [], total: 0, cn: p.collectorNumber };
        rows.set(name, row);
      }
      row.printings.push(p);
      row.indices.push(idx);
      row.total += p.quantity;
      if (compareCn(p.collectorNumber, row.cn) < 0) row.cn = p.collectorNumber;
    });
  }

  return [...bySet.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)))
    .map(([set, rowMap]) => {
      const rows = [...rowMap.values()]
        .sort((a, b) => compareCn(a.cn, b.cn) || a.name.localeCompare(b.name))
        .map(({ name, printings, indices, total }) => ({ name, printings, indices, total }));
      return {
        set,
        cards: rows.length,
        copies: rows.reduce((s, r) => s + r.total, 0),
        rows,
      };
    });
}
