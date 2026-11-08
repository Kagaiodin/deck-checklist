// The Backup (GLOSSARY.md): building one from storage, reading one back, and importing it.
//
// Export reads storage, not React state: every owner has saved by the time someone clicks.
// Import writes storage and reloads the page, as demo mode does, so no in-memory copy is left
// to save stale data over the import. Other tabs reload too (see BACKUP_IMPORTED_KEY).
//
// The per-field rules are in backupFields.ts and the wording in backupMessages.ts. Storage is
// injected (BackupDeps) so tests can run this without the App.

import type { Backup, ImportCounts, ToastInput } from "../../types/index";
import { STORAGE_KEYS, type BackupField } from "../../store/storageKeys";
import { applyCollectionToCards } from "../../utils/csvParser";
import { isDemoActive } from "../demo/demoMode";
import { page } from "../../utils/page";
import { BACKUP_FIELDS, fieldAccepts, isRecord, planField, readField, type BackupValues, type ImportMode } from "./backupFields";
import { importToasts, type ImportSource } from "./backupMessages";

export { BACKUP_FIELDS, type BackupValues, type ImportMode } from "./backupFields";

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

/** The localStorage key each field is saved under, from the registry. */
const FIELD_KEYS = Object.fromEntries(
  STORAGE_KEYS.flatMap(e => (e.backup === false ? [] : [[e.backup, e.key]])),
) as Record<BackupField, string>;

/** Fields holding User data (not Working state): what a Drive load would cost the user. */
const USER_DATA_FIELDS = BACKUP_FIELDS.filter(f => STORAGE_KEYS.some(e => e.backup === f && e.kind === "user-data"));

function parseStored(storage: Storage, field: BackupField): unknown {
  try {
    const raw = storage.getItem(FIELD_KEYS[field]);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Every field as saved in storage, in the form the app keeps it in; missing or unreadable values read as empty. */
export function readStoredValues(storage: Storage): BackupValues {
  const out: Partial<BackupValues> = {};
  for (const field of BACKUP_FIELDS) setField(out, field, readField(field, parseStored(storage, field)));
  return out as BackupValues;
}

/** Assigns one field; generic so each field keeps its own type. */
function setField<F extends BackupField>(values: Partial<BackupValues>, field: F, value: BackupValues[F]): void {
  values[field] = value;
}

/** A Backup of what's saved now, or null in demo mode (sample data is never backed up). */
export function buildBackup(storage: Storage, now: Date = new Date()): Backup | null {
  if (isDemoActive(storage)) return null;
  return { version: 1, exportedAt: now.toISOString(), ...readStoredValues(storage) };
}

/** True when this device holds User data that loading a Backup over it would replace. */
export function hasReplaceableUserData(storage: Storage): boolean {
  const values = readStoredValues(storage);
  return USER_DATA_FIELDS.some(f => {
    const v = values[f];
    return Array.isArray(v) ? v.length > 0 : v !== null && Object.keys(v).length > 0;
  });
}

/** A file that passed parseBackup. */
export type ParsedBackupFile = { ok: true; backup: Backup; newerVersion: boolean };

export type ParsedBackup =
  | ParsedBackupFile
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
  for (const field of BACKUP_FIELDS) {
    if (raw[field] !== undefined && !fieldAccepts(field, raw[field])) return { ok: false, error: "bad-field", field };
  }
  return { ok: true, backup: raw as unknown as Backup, newerVersion: typeof raw.version === "number" && raw.version > 1 };
}

/** What each field becomes after importing `incoming`, and what the import added. Pure. */
export function planImport(local: BackupValues, incoming: Backup, mode: ImportMode): { next: BackupValues; counts: ImportCounts } {
  const next: Partial<BackupValues> = {};
  const counts: ImportCounts = { newDecks: 0, newCards: 0, newOrders: 0, newTrades: 0 };
  const plan = <F extends BackupField>(field: F) => {
    const { value, count } = planField(field, local[field], readField(field, incoming[field]), mode, next);
    setField(next, field, value);
    if (count) counts[count.as] = count.n;
  };
  for (const field of BACKUP_FIELDS) plan(field);
  // Decks are tagged against the Collection. In the app a Collection change re-tags them
  // (DeckProvider's APPLY_COLLECTION), but after the reload the stored decks are taken as already
  // matching, so tag them here, against the normalized result.
  const values = next as BackupValues;
  values.decks = values.decks.map(d => ({ ...d, cards: applyCollectionToCards(d.cards, values.collection) }));
  return { next: values, counts };
}

export type ImportResult = { ok: true; counts: ImportCounts } | { ok: false; reason: "demo" | "storage" };

/**
 * Imports a parsed Backup: works out every field, writes them all or none, then reloads the page so
 * the app re-reads storage. On a failed write everything is put back and the page doesn't reload.
 */
export function importBackup(
  { backup, newerVersion }: ParsedBackupFile,
  { mode, source }: { mode: ImportMode; source: ImportSource },
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
