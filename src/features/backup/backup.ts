// The Backup (GLOSSARY.md): building one from storage, reading one back, and importing it.
//
// Export reads storage, not React state: every owner has saved by the time someone clicks.
// Import writes storage and reloads the page, as demo mode does, so no in-memory copy is left
// to save stale data over the import. Other tabs reload too (see BACKUP_IMPORTED_KEY).
//
// Storage is injected (BackupDeps) so tests can run this without the App.

import type { Backup, ImportCounts, ToastInput } from "../../types/index";
import { STORAGE_KEYS, type BackupField } from "../../store/storageKeys";
import { mergeCollections } from "../../store/collection";
import { applyCollectionToCards } from "../../utils/csvParser";
import { mergeLedger, sanitizeLedger, sortLedger } from "../../utils/tradeLedger";
import { sanitizeExcluded } from "../transactions/binder/useBinder";
import { isDemoActive } from "../demo/demoMode";
import { page } from "../../utils/page";

/** Bumped after an import so other open tabs reload. Bookkeeping, not app data, so it isn't in STORAGE_KEYS. */
export const BACKUP_IMPORTED_KEY = "fetchlist:backup:imported";
/** sessionStorage: the toasts to show once the page has reloaded after an import. */
export const IMPORT_FLASH_KEY = "fetchlist:backup:flash";

export interface BackupDeps {
  storage: Storage;
  session: Storage;
  reload: () => void;
  now: () => Date;
}

const defaultDeps = (): BackupDeps => ({
  storage: window.localStorage,
  session: window.sessionStorage,
  reload: () => page.reload(),
  now: () => new Date(),
});

/** Every saved field of a Backup, with absent optional fields filled in. */
export type BackupValues = Required<Omit<Backup, "version" | "exportedAt">>;

type Merged<F extends BackupField> = { value: BackupValues[F]; added: number };

interface FieldStrategy<F extends BackupField> {
  /** The value when storage or the backup has none. */
  empty: () => BackupValues[F];
  /** Top-level type check. A backup field that fails it rejects the file; a stored one reads as empty. */
  accepts: (raw: unknown) => boolean;
  /** Replace mode: what an incoming value becomes. Defaults to the value itself. */
  replace?: (incoming: BackupValues[F]) => BackupValues[F];
  /** Merge mode: keep what's here, add what's new. `next` holds the fields merged before this one. */
  merge: (local: BackupValues[F], incoming: BackupValues[F], next: Partial<BackupValues>) => Merged<F>;
  /** The ImportCounts entry this field reports, and how big a replaced value is. */
  count?: { as: keyof ImportCounts; size: (v: BackupValues[F]) => number };
}

const isArray = (raw: unknown) => Array.isArray(raw);
const isRecord = (raw: unknown): raw is Record<string, unknown> => typeof raw === "object" && raw !== null && !Array.isArray(raw);

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
    replace: sanitizeExcluded,
    merge: (local, incoming) => ({ value: [...new Set([...local, ...sanitizeExcluded(incoming)])], added: 0 }),
  },
};

export const BACKUP_FIELDS = Object.keys(STRATEGIES) as BackupField[];

// Every saved field of a Backup is a registry BackupField and the other way round, so a field added
// to one fails typecheck here until the other (and a STRATEGIES entry) has it.
type SameKeys<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const fieldsMatch: SameKeys<Exclude<keyof Backup, "version" | "exportedAt">, BackupField> = true;
void fieldsMatch;

/** The localStorage key each field is saved under, from the registry. */
const FIELD_KEYS = Object.fromEntries(
  STORAGE_KEYS.flatMap(e => (e.backup === false ? [] : [[e.backup, e.key]])),
) as Record<BackupField, string>;

/** Fields holding User data (not Working state): what counts as "data on this device" before a Drive load. */
const USER_DATA_FIELDS = BACKUP_FIELDS.filter(f => STORAGE_KEYS.some(e => e.backup === f && e.kind === "user-data"));

/** Every field as saved in storage; missing or unreadable values read as empty. */
export function readStoredValues(storage: Storage): BackupValues {
  const out: Partial<Record<BackupField, unknown>> = {};
  for (const field of BACKUP_FIELDS) {
    const strategy = STRATEGIES[field];
    let value: unknown;
    try {
      const raw = storage.getItem(FIELD_KEYS[field]);
      value = raw === null ? undefined : JSON.parse(raw);
    } catch {
      value = undefined;
    }
    out[field] = value !== undefined && strategy.accepts(value) ? value : strategy.empty();
  }
  return out as BackupValues;
}

/** A Backup of what's saved now, or null in demo mode (sample data is never backed up). */
export function buildBackup(storage: Storage, now: Date = new Date()): Backup | null {
  if (isDemoActive(storage)) return null;
  return { version: 1, exportedAt: now.toISOString(), ...readStoredValues(storage) };
}

/** True when this device holds any User data a Backup would replace. */
export function hasBackedUpUserData(storage: Storage): boolean {
  const values = readStoredValues(storage);
  return USER_DATA_FIELDS.some(f => {
    const v = values[f];
    return Array.isArray(v) ? v.length > 0 : v !== null && Object.keys(v).length > 0;
  });
}

export type ParsedBackup =
  | { ok: true; backup: Backup; newerVersion: boolean }
  | { ok: false; error: "unreadable" | "not-a-backup" }
  | { ok: false; error: "bad-field"; field: BackupField };

/** Reads a Backup file. Checks the envelope and each field's top-level type, nothing deeper. */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "unreadable" };
  }
  if (!isRecord(raw) || !("version" in raw) || !("decks" in raw || "collection" in raw || "orders" in raw)) {
    return { ok: false, error: "not-a-backup" };
  }
  const data = raw as Record<string, unknown>;
  for (const field of BACKUP_FIELDS) {
    if (data[field] !== undefined && !STRATEGIES[field].accepts(data[field])) return { ok: false, error: "bad-field", field };
  }
  return { ok: true, backup: raw as unknown as Backup, newerVersion: typeof data.version === "number" && data.version > 1 };
}

export type ImportMode = "merge" | "replace";

/** What each field becomes after importing `incoming`, and what the import added. Pure. */
export function planImport(local: BackupValues, incoming: Backup, mode: ImportMode): { next: BackupValues; counts: ImportCounts } {
  const next: Partial<Record<BackupField, unknown>> = {};
  const counts: ImportCounts = { newDecks: 0, newCards: 0, newOrders: 0, newTrades: 0 };
  for (const field of BACKUP_FIELDS) {
    // Typed per field inside the loop; the table guarantees each strategy matches its field.
    const strategy = STRATEGIES[field] as unknown as FieldStrategy<"decks">;
    const given = incoming[field] as BackupValues["decks"] | undefined;
    const value = given ?? strategy.empty();
    if (mode === "replace") {
      const replaced = strategy.replace ? strategy.replace(value) : value;
      next[field] = replaced;
      if (strategy.count) counts[strategy.count.as] = strategy.count.size(replaced);
    } else {
      const merged = strategy.merge(local[field] as BackupValues["decks"], value, next as Partial<BackupValues>);
      next[field] = merged.value;
      if (strategy.count) counts[strategy.count.as] = merged.added;
    }
  }
  // Decks are tagged against the Collection. In the app a Collection change re-tags them
  // (DeckProvider's APPLY_COLLECTION), but after the reload the stored decks are taken as already
  // matching, so tag them here.
  const values = next as BackupValues;
  values.decks = values.decks.map(d => ({ ...d, cards: applyCollectionToCards(d.cards, values.collection) }));
  return { next: values, counts };
}

export type ImportSource = "file" | "drive" | "drive-conflict";

/** The toasts an import shows once the page has reloaded. */
export function importToasts(source: ImportSource, counts: ImportCounts, newerVersion: boolean): ToastInput[] {
  const toasts: ToastInput[] = [];
  if (newerVersion) toasts.push({ title: "Newer backup format", sub: "Some data may not import correctly.", variant: "warn" });
  if (source === "drive") toasts.push({ title: "Loaded from Drive", variant: "success", autoDismiss: 2000 });
  else if (source === "drive-conflict") toasts.push({ title: "Loaded Drive version", variant: "success", autoDismiss: 2000 });
  else {
    const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? "s" : ""}`;
    const parts: string[] = [];
    if (counts.newDecks > 0) parts.push(plural(counts.newDecks, "deck"));
    if (counts.newCards > 0) parts.push(`${counts.newCards} collection cards`);
    if (counts.newOrders > 0) parts.push(plural(counts.newOrders, "order"));
    if (counts.newTrades) parts.push(plural(counts.newTrades, "trade"));
    toasts.push(parts.length === 0
      ? { title: "Nothing new to import", sub: "All items already exist locally.", variant: "neutral", autoDismiss: 3000 }
      : { title: "Import complete", sub: `${parts.join(" · ")} added`, variant: "success" });
  }
  return toasts;
}

export type ImportResult = { ok: true; counts: ImportCounts } | { ok: false; reason: "demo" | "storage" };

/**
 * Imports a Backup: works out every field, writes them all or none, then reloads the page so the
 * app re-reads storage. On a failed write everything is put back and the page doesn't reload.
 */
export function importBackup(
  backup: Backup,
  { mode, source, newerVersion = false }: { mode: ImportMode; source: ImportSource; newerVersion?: boolean },
  deps: BackupDeps = defaultDeps(),
): ImportResult {
  const { storage } = deps;
  // Backups must never land on top of sample data.
  if (isDemoActive(storage)) return { ok: false, reason: "demo" };

  const { next, counts } = planImport(readStoredValues(storage), backup, mode);
  const writes = BACKUP_FIELDS.map(f => [FIELD_KEYS[f], JSON.stringify(next[f])] as const);
  const snapshot = writes.map(([key]) => [key, storage.getItem(key)] as const);
  try {
    for (const [key, value] of writes) storage.setItem(key, value);
  } catch {
    for (const [key, value] of snapshot) {
      try {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      } catch { /* putting back what was there can't need more room than it had */ }
    }
    return { ok: false, reason: "storage" };
  }

  try { storage.setItem(BACKUP_IMPORTED_KEY, String(deps.now().getTime())); } catch { /* other tabs miss the reload */ }
  try { deps.session.setItem(IMPORT_FLASH_KEY, JSON.stringify(importToasts(source, counts, newerVersion))); } catch { /* no toast */ }
  deps.reload();
  return { ok: true, counts };
}

/** The toasts left by an import before the reload; each is shown once. */
export function consumeImportToasts(session: Storage = window.sessionStorage): ToastInput[] {
  try {
    const raw = session.getItem(IMPORT_FLASH_KEY);
    session.removeItem(IMPORT_FLASH_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ToastInput[]) : [];
  } catch {
    return [];
  }
}

export const IMPORT_STORAGE_ERROR = "There isn't enough storage space for this backup. Nothing was changed.";
