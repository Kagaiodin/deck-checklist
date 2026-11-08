// The rules for each saved field of a Backup: its empty value, the type a file must give it, how
// it is cleaned, and how it merges into or replaces what's on this device. Pure; backup.ts does the
// storage reads and writes.

import type { Backup, ImportCounts } from "../../types/index";
import type { BackupField } from "../../store/storageKeys";
import { mergeCollections, normalizeSets } from "../../store/collection";
import { mergeLedger, sanitizeLedger, sortLedger } from "../../utils/tradeLedger";
import { sanitizeExcluded } from "../../utils/binderExcluded";

/** Every saved field of a Backup, with absent optional fields filled in. */
export type BackupValues = Required<Omit<Backup, "version" | "exportedAt">>;

export type ImportMode = "merge" | "replace";

interface FieldStrategy<F extends BackupField> {
  /** The value when storage or the backup has none. */
  empty: () => BackupValues[F];
  /** Top-level type check. A backup field that fails it rejects the file; a stored one reads as empty. */
  accepts: (raw: unknown) => boolean;
  /** Puts a value in the form the app keeps it in, whether read from storage or from a backup. */
  normalize?: (value: BackupValues[F]) => BackupValues[F];
  /** Replace mode: what an incoming value becomes. Defaults to the value itself. */
  replace?: (incoming: BackupValues[F]) => BackupValues[F];
  /** Merge mode: keep what's here, add what's new. `next` holds the fields merged before this one. */
  merge: (local: BackupValues[F], incoming: BackupValues[F], next: Partial<BackupValues>) => { value: BackupValues[F]; added: number };
  /** The ImportCounts entry this field reports, and how big a replaced value is. */
  count?: { as: keyof ImportCounts; size: (v: BackupValues[F]) => number };
}

export const isRecord = (raw: unknown): raw is Record<string, unknown> => typeof raw === "object" && raw !== null && !Array.isArray(raw);
const isArray = (raw: unknown) => Array.isArray(raw);

/** Appends incoming items whose id isn't here yet. */
function addNewById<T extends { id: string }>(local: T[], incoming: T[]): { value: T[]; added: number } {
  const have = new Set(local.map(x => x.id));
  const fresh = incoming.filter(x => !have.has(x.id));
  return { value: [...local, ...fresh], added: fresh.length };
}

const VENDOR_HISTORY_CAP = 50;

// One entry per BackupField, in the order fields appear in a Backup file. collectionMeta comes
// after collection because its merge counts the merged Collection.
const STRATEGIES: { [F in BackupField]: FieldStrategy<F> } = {
  decks: {
    empty: () => [],
    accepts: isArray,
    merge: addNewById,
    count: { as: "newDecks", size: v => v.length },
  },
  errors: {
    empty: () => ({}),
    accepts: isRecord,
    // Adopt a deck's errors only when this device has none for it.
    merge: (local, incoming) => ({ value: { ...incoming, ...local }, added: 0 }),
  },
  collection: {
    empty: () => ({}),
    accepts: isRecord,
    // Set codes as the Collection store keeps them (one case, case twins collapsed).
    normalize: normalizeSets,
    merge: (local, incoming) => {
      const { merged, added } = mergeCollections(local, incoming);
      return { value: merged, added };
    },
    count: { as: "newCards", size: v => Object.keys(v).length },
  },
  collectionMeta: {
    empty: () => null,
    accepts: raw => raw === null || isRecord(raw),
    // Local meta wins; with none, the backup's is adopted. Either way the count follows the merged Collection.
    merge: (local, incoming, next) => {
      const meta = local ?? incoming;
      const cardCount = Object.keys(next.collection ?? {}).length;
      return { value: meta ? { ...meta, cardCount } : null, added: 0 };
    },
  },
  orders: {
    empty: () => [],
    accepts: isArray,
    merge: addNewById,
    count: { as: "newOrders", size: v => v.length },
  },
  vendorHistory: {
    empty: () => [],
    accepts: isArray,
    replace: v => v.slice(0, VENDOR_HISTORY_CAP),
    merge: (local, incoming) => ({ value: [...new Set([...local, ...incoming])].slice(0, VENDOR_HISTORY_CAP), added: 0 }),
  },
  tradeLedger: {
    empty: () => [],
    accepts: isArray,
    replace: v => sortLedger(sanitizeLedger(v)),
    merge: (local, incoming) => {
      const { merged, added } = mergeLedger(local, sanitizeLedger(incoming));
      return { value: merged, added };
    },
    count: { as: "newTrades", size: v => v.length },
  },
  binderExcluded: {
    empty: () => [],
    accepts: isArray,
    normalize: sanitizeExcluded,
    merge: (local, incoming) => ({ value: [...new Set([...local, ...incoming])], added: 0 }),
  },
};

export const BACKUP_FIELDS = Object.keys(STRATEGIES) as BackupField[];

// Every saved field of a Backup is a registry BackupField and the other way round, so a field added
// to one fails typecheck here until the other (and a STRATEGIES entry) has it.
type SameKeys<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const fieldsMatch: SameKeys<Exclude<keyof Backup, "version" | "exportedAt">, BackupField> = true;
void fieldsMatch;

/** A stored or incoming value for `field`, or its empty value when absent or of the wrong type. */
export function readField<F extends BackupField>(field: F, raw: unknown): BackupValues[F] {
  const strategy: FieldStrategy<F> = STRATEGIES[field];
  if (raw === undefined || !strategy.accepts(raw)) return strategy.empty();
  const value = raw as BackupValues[F];
  return strategy.normalize ? strategy.normalize(value) : value;
}

/** Whether a backup file's value for `field` has the type the field needs. */
export function fieldAccepts(field: BackupField, raw: unknown): boolean {
  return STRATEGIES[field].accepts(raw);
}

/** What one field becomes after an import, and how many new things it brought (if it counts any). */
export function planField<F extends BackupField>(
  field: F, local: BackupValues[F], incoming: BackupValues[F], mode: ImportMode, next: Partial<BackupValues>,
): { value: BackupValues[F]; count?: { as: keyof ImportCounts; n: number } } {
  const strategy: FieldStrategy<F> = STRATEGIES[field];
  if (mode === "replace") {
    const value = strategy.replace ? strategy.replace(incoming) : incoming;
    return { value, count: strategy.count && { as: strategy.count.as, n: strategy.count.size(value) } };
  }
  const { value, added } = strategy.merge(local, incoming, next);
  return { value, count: strategy.count && { as: strategy.count.as, n: added } };
}
