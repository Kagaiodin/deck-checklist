// Every localStorage key the app saves to, and what kind of data each one holds (GLOSSARY.md:
// User data, Working state, Preference). Demo mode's key lists and the storage-key scan are
// derived from STORAGE_KEYS. No imports, so any module can use the keys without pulling in UI.
//
// Call sites pass the constants below to localStorage/useLocalStorage directly, never
// `STORAGE_KEYS[i].key`: src/__tests__/storageKeys.test.ts resolves keys by constant name.

export const DECKS_KEY = "mtg-checklist-decks";
export const COLLECTION_KEY = "mtg-checklist-collection-v2";
export const ORDERS_KEY = "mtg-checklist-orders-v1";
export const ERRORS_KEY = "mtg-checklist-errors";
export const TRADE_LEDGER_KEY = "mtg-checklist-trade-ledger-v1";
export const TRADE_STORAGE_KEY = "fetchlist-trade";

export const COLLECTION_META_KEY = "mtg-checklist-collection-meta-v2";
export const VENDOR_HISTORY_KEY = "mtg-checklist-vendor-history";
export const BINDER_EXCLUDED_KEY = "mtg-checklist-binder-excluded-v1";
export const LAST_VENDOR_KEY = "fetchlist-last-vendor";
export const VENDOR_LAST_USED_KEY = "fetchlist-vendor-last-used";
export const ONBOARDING_DISMISSED_KEY = "fetchlist:onboarding:dismissed";
export const COACHMARK_DISMISSED_KEY = "fetchlist-coachmark-dismissed-decks";

export const THEME_MODE_KEY = "fl-theme-mode";
export const THEME_ACCENT_KEY = "fl-theme-accent";
export const SIDEBAR_COLLAPSED_KEY = "fl-sidebar-collapsed";
export const EXTRA_INFO_OPEN_KEY = "fetchlist:extrainfo-open";

export type StorageKind = "user-data" | "working-state" | "preference";

/** The Backup field a key is saved under. Checked against Backup in this module's test. */
export type BackupField = "decks" | "errors" | "collection" | "collectionMeta" | "orders" | "vendorHistory" | "tradeLedger" | "binderExcluded";

type StorageKeyEntry =
  | { key: string; kind: "user-data"; backup: BackupField }
  /** User data left out of backups must say why. */
  | { key: string; kind: "user-data"; backup: false; reason: string }
  | { key: string; kind: "working-state"; backup: BackupField | false }
  | { key: string; kind: "preference"; backup: false };

export const STORAGE_KEYS = [
  { key: DECKS_KEY, kind: "user-data", backup: "decks" },
  { key: COLLECTION_KEY, kind: "user-data", backup: "collection" },
  { key: ORDERS_KEY, kind: "user-data", backup: "orders" },
  { key: ERRORS_KEY, kind: "user-data", backup: "errors" },
  { key: TRADE_LEDGER_KEY, kind: "user-data", backup: "tradeLedger" },
  {
    key: TRADE_STORAGE_KEY, kind: "user-data", backup: false,
    reason: "A trade in progress is a draft: it is finished or cleared within a session, and a logged trade is backed up through the trade ledger.",
  },

  { key: COLLECTION_META_KEY, kind: "working-state", backup: "collectionMeta" },
  { key: VENDOR_HISTORY_KEY, kind: "working-state", backup: "vendorHistory" },
  { key: BINDER_EXCLUDED_KEY, kind: "working-state", backup: "binderExcluded" },
  { key: LAST_VENDOR_KEY, kind: "working-state", backup: false },
  { key: VENDOR_LAST_USED_KEY, kind: "working-state", backup: false },
  { key: ONBOARDING_DISMISSED_KEY, kind: "working-state", backup: false },
  // Holds deck ids, so real and demo dismissals must not mix.
  { key: COACHMARK_DISMISSED_KEY, kind: "working-state", backup: false },

  { key: THEME_MODE_KEY, kind: "preference", backup: false },
  { key: THEME_ACCENT_KEY, kind: "preference", backup: false },
  { key: SIDEBAR_COLLAPSED_KEY, kind: "preference", backup: false },
  { key: EXTRA_INFO_OPEN_KEY, kind: "preference", backup: false },
] as const satisfies readonly StorageKeyEntry[];

/** One STORAGE_KEYS entry with its literal key; StorageKeyEntry is the shape every entry must fit. */
type RegisteredKey = (typeof STORAGE_KEYS)[number];
export type KeyOfKind<K extends StorageKind> = Extract<RegisteredKey, { kind: K }>["key"];

/** The keys of the given kinds, typed as their literal strings. */
export function keysOfKind<K extends StorageKind>(...kinds: K[]): KeyOfKind<K>[] {
  return STORAGE_KEYS.filter(e => (kinds as StorageKind[]).includes(e.kind)).map(e => e.key as KeyOfKind<K>);
}
