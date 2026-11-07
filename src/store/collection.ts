import { useSyncExternalStore } from "react";
import type { Collection, CollectionMeta, CollectionPrinting } from "../types/index";
import { normalizeSet, samePrinting } from "../utils/printing";
import { COLLECTION_KEY, COLLECTION_META_KEY } from "../features/collection/storageKeys";

/** Where the store keeps the Collection between sessions. One method per key, so key ownership stays visible. */
export interface CollectionStorage {
  loadCollection(): string | null;
  loadMeta(): string | null;
  saveCollection(json: string): void;
  saveMeta(json: string): void;
}

export interface CollectionState {
  collection: Collection;
  meta: CollectionMeta | null;
}

/**
 * The backup-merge union: every printing in either side, keeping the base copy of a printing
 * both sides have. `added` counts card names the base didn't have.
 */
export function mergeCollections(base: Collection, incoming: Collection): { merged: Collection; added: number } {
  const merged = { ...base };
  let added = 0;
  for (const [name, printings] of Object.entries(incoming)) {
    const existing = merged[name] ?? [];
    if (existing.length === 0) added++;
    const union = [...existing];
    for (const p of printings) {
      if (!union.some(e => samePrinting(e, p))) union.push(p);
    }
    merged[name] = union;
  }
  return { merged, added };
}

/**
 * Stores every set code in its canonical form (#196). Printings that only differed in set case
 * become one, keeping the larger quantity: the backup merge used to compare case-sensitively,
 * so such a pair is the same cards seen from two devices. Hands back `collection` itself when
 * nothing needed changing.
 */
function normalizeSets(collection: Collection): Collection {
  let out: Collection | null = null;
  for (const [name, printings] of Object.entries(collection)) {
    if (!Array.isArray(printings) || printings.every(p => p.set === normalizeSet(p.set))) continue;
    const merged: { printing: CollectionPrinting; changed: boolean }[] = [];
    for (const p of printings) {
      const set = normalizeSet(p.set);
      const changed = set !== p.set;
      const printing: CollectionPrinting = changed ? withSet(p, set) : p;
      const twin = merged.find(m => samePrinting(m.printing, printing));
      if (twin && (changed || twin.changed)) {
        if (printing.quantity > twin.printing.quantity) twin.printing = { ...twin.printing, quantity: printing.quantity };
        twin.changed = true;
      } else {
        merged.push({ printing, changed });
      }
    }
    out ??= { ...collection };
    out[name] = merged.map(m => m.printing);
  }
  return out ?? collection;
}

function withSet(p: CollectionPrinting, set: string | undefined): CollectionPrinting {
  const next = { ...p, set };
  if (set === undefined) delete next.set;
  return next;
}

function parse<T>(load: () => string | null, fallback: T): T {
  try {
    const raw = load();
    return raw ? (JSON.parse(raw) as T) ?? fallback : fallback;
  } catch {
    return fallback;
  }
}

export function createCollectionStore(storage: CollectionStorage) {
  let state: CollectionState | null = null;
  const listeners = new Set<() => void>();

  /** Loads on first use, so anything that rewrites storage at boot (demo refresh) runs first. */
  function current(): CollectionState {
    state ??= {
      collection: normalizeSets(parse<Collection>(() => storage.loadCollection(), {})),
      meta: parse<CollectionMeta | null>(() => storage.loadMeta(), null),
    };
    return state;
  }

  function commit(given: CollectionState) {
    const prev = current();
    const next = { ...given, collection: normalizeSets(given.collection) };
    if (next.collection === prev.collection && next.meta === prev.meta) return;
    state = next;
    // Memory is the source of truth; a full or blocked storage only costs persistence.
    try { storage.saveCollection(JSON.stringify(next.collection)); } catch { /* quota */ }
    try { storage.saveMeta(JSON.stringify(next.meta)); } catch { /* quota */ }
    for (const cb of [...listeners]) cb();
  }

  return {
    get: () => current().collection,
    getMeta: () => current().meta,
    /** Both values as one object that only changes identity on a change (for useSyncExternalStore). */
    getSnapshot: (): CollectionState => current(),
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    /**
     * Changes the Collection. `cardCount` follows along on existing meta; with no meta,
     * one named after `source` is created, or none if no source is given.
     */
    update(fn: (collection: Collection) => Collection, { source }: { source?: string } = {}) {
      const { collection, meta } = current();
      const next = fn(collection);
      if (next === collection) return;
      const cardCount = Object.keys(next).length;
      const nextMeta = meta
        ? { ...meta, cardCount }
        : source !== undefined ? { fileName: source, importedAt: Date.now(), cardCount } : null;
      commit({ collection: next, meta: nextMeta });
    },
    /** Sets both values exactly as given: a file import, a cleared Collection, an undo. */
    replace(collection: Collection, meta: CollectionMeta | null) {
      commit({ collection, meta });
    },
    /** Test-only: forget the loaded value and every subscriber; the next read loads storage again. */
    unload() {
      state = null;
      listeners.clear();
    },
  };
}

export type CollectionStore = ReturnType<typeof createCollectionStore>;

/** localStorage, resolved on every call so tests can swap it out. */
export const browserCollectionStorage: CollectionStorage = {
  loadCollection: () => window.localStorage.getItem(COLLECTION_KEY),
  loadMeta: () => window.localStorage.getItem(COLLECTION_META_KEY),
  saveCollection: json => window.localStorage.setItem(COLLECTION_KEY, json),
  saveMeta: json => window.localStorage.setItem(COLLECTION_META_KEY, json),
};

/** The app's one Collection. */
export const collectionStore = createCollectionStore(browserCollectionStorage);

/** The current Collection and its meta; re-renders on every change. */
export function useCollection(): CollectionState {
  return useSyncExternalStore(collectionStore.subscribe, collectionStore.getSnapshot);
}

/** Called before each test (src/test/setup.ts) so no test sees another's Collection. */
export function resetForTests() {
  collectionStore.unload();
}
