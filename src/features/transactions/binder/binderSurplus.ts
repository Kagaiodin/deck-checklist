import type { Collection, CollectionPrinting } from "../../../types/index";
import type { CommittedInfo } from "../../../types/collection";
import { displayName } from "../../trade/format";

export { displayName };

export interface BinderRow {
  /** Lowercased card name, the Collection key. */
  key: string;
  name: string;
  owned: number;
  committed: number;
  /** owned - committed, always > 0. */
  surplus: number;
  printings: CollectionPrinting[];
}

export interface Binder {
  rows: BinderRow[];
  /** Surplus cards the user chose to keep out of the Binder ("Keep these"). */
  excludedRows: BinderRow[];
}

/** "{owned} owned · {committed} in decks · {surplus} spare" with the empty parts left out. */
export function surplusLabel(row: Pick<BinderRow, "owned" | "committed" | "surplus">): string {
  const parts = [`${row.owned} owned`];
  if (row.committed > 0) parts.push(`${row.committed} in decks`);
  parts.push(`${row.surplus} spare`);
  return parts.join(" · ");
}

/**
 * Copies owned beyond what decks need, per card name (deck cards carry no set or
 * finish, so name is the only basis that matches `ownedFor` and Collection's "free").
 * Pure; no prices, no totals.
 */
export function deriveBinder(
  collection: Collection,
  getCommittedInfo: (key: string) => CommittedInfo,
  excluded: ReadonlySet<string>,
): Binder {
  const rows: BinderRow[] = [];
  const excludedRows: BinderRow[] = [];
  for (const [key, printings] of Object.entries(collection)) {
    const owned = printings.reduce((n, p) => n + p.quantity, 0);
    const committed = getCommittedInfo(key).total;
    const surplus = owned - committed;
    if (surplus <= 0) continue;
    const row: BinderRow = { key, name: displayName(key), owned, committed, surplus, printings };
    (excluded.has(key) ? excludedRows : rows).push(row);
  }
  const byName = (a: BinderRow, b: BinderRow) => a.name.localeCompare(b.name);
  return { rows: rows.sort(byName), excludedRows: excludedRows.sort(byName) };
}

/** The printing a trade seed uses: largest quantity, first on a tie. */
export function primaryPrinting(row: Pick<BinderRow, "printings">): CollectionPrinting | undefined {
  let best: CollectionPrinting | undefined;
  for (const p of row.printings) if (!best || p.quantity > best.quantity) best = p;
  return best;
}
