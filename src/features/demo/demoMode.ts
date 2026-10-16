export const DEMO_ACTIVE_KEY = "fetchlist:demo:active";
export const DEMO_SNAPSHOT_KEY = "fetchlist:demo:snapshot";
export const DEMO_SOURCE_KEY = "fetchlist:demo:source";

export type DemoSource = "link" | "settings";

// Keys replaced while demo mode is active. UI preference keys are deliberately absent.
export const MANAGED_KEYS = [
  "mtg-checklist-decks",
  "mtg-checklist-collection-v2",
  "mtg-checklist-collection-meta-v2",
  "mtg-checklist-orders-v1",
  "mtg-checklist-vendor-history",
  "mtg-checklist-errors",
  "fetchlist-trade",
  "fetchlist-last-vendor",
  "fetchlist-vendor-last-used",
  "fetchlist:onboarding:dismissed",
] as const;

export function isDemoActive(storage: Storage): boolean {
  return storage.getItem(DEMO_ACTIVE_KEY) === "true";
}

/** Reads the real localStorage; false when it is unavailable. For code outside React that must not run in demo mode. */
export function isDemoActiveNow(): boolean {
  try {
    return isDemoActive(window.localStorage);
  } catch {
    return false;
  }
}

export const DEMO_BACKUP_HINT = "Exit demo mode to back up your data";

/** Values for managed keys; a key missing from `data` is cleared while in demo. */
export type DemoValues = Partial<Record<(typeof MANAGED_KEYS)[number], string>>;

export function enterDemo(storage: Storage, data: DemoValues, source: DemoSource): { ok: boolean } {
  if (isDemoActive(storage)) return { ok: true };
  const snapshot: Record<string, string | null> = {};
  for (const key of MANAGED_KEYS) snapshot[key] = storage.getItem(key);
  try {
    storage.setItem(DEMO_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    return { ok: false };
  }
  try {
    // Flag first: other tabs reload as soon as they see it, shrinking the window
    // in which a stale tab could write its in-memory data over the demo keys.
    storage.setItem(DEMO_SOURCE_KEY, source);
    storage.setItem(DEMO_ACTIVE_KEY, "true");
    for (const key of MANAGED_KEYS) {
      const value = data[key];
      if (value === undefined) storage.removeItem(key);
      else storage.setItem(key, value);
    }
  } catch {
    // Quota hit midway: put everything back as it was.
    restore(storage, snapshot);
    clearDemoKeys(storage);
    return { ok: false };
  }
  return { ok: true };
}

/** `recovered` is true when the snapshot was missing or corrupt and managed keys were cleared instead. */
export function exitDemo(storage: Storage): { recovered: boolean } {
  // Another tab may have exited already; never touch data that isn't demo data.
  if (!isDemoActive(storage)) return { recovered: false };
  const snapshot = readSnapshot(storage);
  restore(storage, snapshot ?? {});
  clearDemoKeys(storage);
  return { recovered: snapshot === null };
}

// Keys that count as the user's own data when deciding whether to confirm a replace.
const DATA_KEYS = [
  "mtg-checklist-decks",
  "mtg-checklist-collection-v2",
  "mtg-checklist-orders-v1",
  "mtg-checklist-errors",
  "fetchlist-trade",
] as const;

export function hasRealData(storage: Storage): boolean {
  return DATA_KEYS.some((key) => {
    const raw = storage.getItem(key);
    if (raw === null) return false;
    try {
      return !isEmptyValue(JSON.parse(raw));
    } catch {
      return true;
    }
  });
}

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("mine" in o && "theirs" in o) return isSideEmpty(o.mine) && isSideEmpty(o.theirs);
    return Object.keys(o).length === 0;
  }
  return false;
}

function isSideEmpty(side: unknown): boolean {
  const s = side as { cards?: unknown[]; cash?: unknown[] } | null;
  return !s || ((s.cards?.length ?? 0) === 0 && (s.cash?.length ?? 0) === 0);
}

function restore(storage: Storage, snapshot: Record<string, string | null>): void {
  for (const key of MANAGED_KEYS) {
    const original = snapshot[key] ?? null;
    try {
      if (original === null) storage.removeItem(key);
      else storage.setItem(key, original);
    } catch {
      // Best effort: keep restoring the remaining keys.
    }
  }
}

function clearDemoKeys(storage: Storage): void {
  storage.removeItem(DEMO_ACTIVE_KEY);
  storage.removeItem(DEMO_SNAPSHOT_KEY);
  storage.removeItem(DEMO_SOURCE_KEY);
}

function readSnapshot(storage: Storage): Record<string, string | null> | null {
  try {
    const raw = storage.getItem(DEMO_SNAPSHOT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
