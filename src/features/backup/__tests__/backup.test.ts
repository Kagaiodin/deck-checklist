import { describe, it, expect, vi, type Mock } from "vitest";
import {
  BACKUP_FIELDS, BACKUP_IMPORTED_KEY, IMPORT_FLASH_KEY, buildBackup, consumeImportToasts, hasBackedUpUserData,
  importBackup, importToasts, parseBackup, planImport, readStoredValues, type BackupDeps,
} from "../backup";
import { MemoryStorage } from "../../demo/__tests__/memoryStorage";
import type { Backup } from "../../../types/index";

const KEYS = {
  decks: "mtg-checklist-decks",
  errors: "mtg-checklist-errors",
  collection: "mtg-checklist-collection-v2",
  collectionMeta: "mtg-checklist-collection-meta-v2",
  orders: "mtg-checklist-orders-v1",
  vendorHistory: "mtg-checklist-vendor-history",
  tradeLedger: "mtg-checklist-trade-ledger-v1",
  binderExcluded: "mtg-checklist-binder-excluded-v1",
};

const NOW = new Date("2026-11-07T12:00:00.000Z");
const entry = (id: string, date: number) => ({ id, date, cardsOut: [], cardsIn: [], cash: { out: 0, in: 3 }, totals: { out: 0, in: 3 } });
const deck = (id: string) => ({ id, name: id, createdAt: 1, cards: [] });
const order = (id: string) => ({ id, vendor: "TCGplayer", status: "ordered", cards: [] });

function seeded(values: Partial<Record<keyof typeof KEYS, unknown>>): MemoryStorage {
  const storage = new MemoryStorage();
  for (const [field, value] of Object.entries(values)) storage.setItem(KEYS[field as keyof typeof KEYS], JSON.stringify(value));
  return storage;
}

function deps(storage: Storage): BackupDeps & { session: MemoryStorage; reload: Mock<() => void> } {
  return { storage, session: new MemoryStorage(), reload: vi.fn<() => void>(), now: () => NOW };
}

const stored = (storage: Storage, field: keyof typeof KEYS) => JSON.parse(storage.getItem(KEYS[field]) ?? "null");

// A device with one of everything, as the app saves it.
const LOCAL = {
  decks: [deck("d1")],
  errors: { d1: [{ line: "1 Nonsense" }] },
  collection: { "sol ring": [{ quantity: 1, set: "C21", collectorNumber: "263" }] },
  collectionMeta: { fileName: "mine.csv", importedAt: 1, cardCount: 1 },
  orders: [order("o1")],
  vendorHistory: ["TCGplayer"],
  tradeLedger: [entry("t1", 10)],
  binderExcluded: ["sol ring"],
};

// A version 1 file as the app has exported it since Transactions shipped.
const V1_BACKUP = {
  version: 1 as const,
  exportedAt: "2026-10-01T00:00:00.000Z",
  decks: [deck("d1"), deck("d2")],
  errors: { d1: [{ line: "from backup" }], d2: [{ line: "2 Nonsense" }] },
  collection: { "sol ring": [{ quantity: 2, set: "C21", collectorNumber: "263" }], "mana crypt": [{ quantity: 1 }] },
  collectionMeta: { fileName: "backup.csv", importedAt: 2, cardCount: 2 },
  orders: [order("o1"), order("o2")],
  vendorHistory: ["Card Kingdom", "TCGplayer"],
  tradeLedger: [entry("t1", 10), entry("t2", 20), { id: "malformed" }],
  binderExcluded: ["mana crypt", 7],
} as unknown as Backup;

describe("buildBackup", () => {
  it("builds exactly the payload the app exported before (field order included)", () => {
    const backup = buildBackup(seeded(LOCAL), NOW);
    // The pre-module builders spread these values, in this order, onto the v1 envelope.
    expect(JSON.stringify(backup)).toBe(JSON.stringify({
      version: 1, exportedAt: NOW.toISOString(),
      decks: LOCAL.decks, errors: LOCAL.errors, collection: LOCAL.collection, collectionMeta: LOCAL.collectionMeta,
      orders: LOCAL.orders, vendorHistory: LOCAL.vendorHistory, tradeLedger: LOCAL.tradeLedger, binderExcluded: LOCAL.binderExcluded,
    }));
  });

  it("fills in empty values for anything not saved yet, or unreadable", () => {
    const storage = new MemoryStorage();
    storage.setItem(KEYS.orders, "{not json");
    storage.setItem(KEYS.decks, JSON.stringify({ not: "an array" }));
    expect(buildBackup(storage, NOW)).toEqual({
      version: 1, exportedAt: NOW.toISOString(),
      decks: [], errors: {}, collection: {}, collectionMeta: null, orders: [], vendorHistory: [], tradeLedger: [], binderExcluded: [],
    });
  });

  it("refuses in demo mode, so sample data is never exported", () => {
    const storage = seeded(LOCAL);
    storage.setItem("fetchlist:demo:active", "true");
    expect(buildBackup(storage, NOW)).toBeNull();
  });

  it("covers every backup field", () => {
    expect(Object.keys(readStoredValues(new MemoryStorage())).sort()).toEqual([...BACKUP_FIELDS].sort());
  });
});

describe("parseBackup", () => {
  it("accepts a v1 backup", () => {
    expect(parseBackup(JSON.stringify(V1_BACKUP))).toEqual({ ok: true, backup: V1_BACKUP, newerVersion: false });
  });

  it("accepts a partial backup and flags a newer version", () => {
    expect(parseBackup(JSON.stringify({ version: 2, orders: [] }))).toMatchObject({ ok: true, newerVersion: true });
  });

  it("rejects unreadable text and things that aren't backups", () => {
    expect(parseBackup("{nope")).toEqual({ ok: false, error: "unreadable" });
    expect(parseBackup("[]")).toEqual({ ok: false, error: "not-a-backup" });
    expect(parseBackup(JSON.stringify({ decks: [] }))).toEqual({ ok: false, error: "not-a-backup" });
    expect(parseBackup(JSON.stringify({ version: 1, vendorHistory: [] }))).toEqual({ ok: false, error: "not-a-backup" });
  });

  it("rejects the whole file when a field has the wrong type", () => {
    expect(parseBackup(JSON.stringify({ version: 1, decks: [], collection: [] }))).toEqual({ ok: false, error: "bad-field", field: "collection" });
    expect(parseBackup(JSON.stringify({ version: 1, decks: [], tradeLedger: {} }))).toEqual({ ok: false, error: "bad-field", field: "tradeLedger" });
    expect(parseBackup(JSON.stringify({ version: 1, decks: [], collectionMeta: null }))).toMatchObject({ ok: true });
  });
});

describe("planImport", () => {
  it("merge keeps what's here and adds only what's new, as the App-based import did", () => {
    const { next, counts } = planImport(readStoredValues(seeded(LOCAL)), V1_BACKUP, "merge");
    expect(next.decks.map(d => d.id)).toEqual(["d1", "d2"]);
    expect(next.errors).toEqual({ d1: LOCAL.errors.d1, d2: [{ line: "2 Nonsense" }] });
    expect(next.collection).toEqual({ "sol ring": LOCAL.collection["sol ring"], "mana crypt": [{ quantity: 1 }] });
    expect(next.collectionMeta).toEqual({ ...LOCAL.collectionMeta, cardCount: 2 });
    expect(next.orders.map(o => o.id)).toEqual(["o1", "o2"]);
    expect(next.vendorHistory).toEqual(["TCGplayer", "Card Kingdom"]);
    expect(next.tradeLedger.map(e => e.id)).toEqual(["t2", "t1"]);
    expect(next.binderExcluded).toEqual(["sol ring", "mana crypt"]);
    expect(counts).toEqual({ newDecks: 1, newCards: 1, newOrders: 1, newTrades: 1 });
  });

  it("merge adopts the backup's Collection meta when there is none here, counted against the merged Collection", () => {
    const { next } = planImport(readStoredValues(seeded({ collection: { "lightning bolt": [{ quantity: 4 }] } })), V1_BACKUP, "merge");
    expect(next.collectionMeta).toEqual({ fileName: "backup.csv", importedAt: 2, cardCount: 3 });
  });

  it("merge with an old backup (no ledger fields) leaves the ledger and exclude list alone", () => {
    const old = { version: 1, exportedAt: "", decks: [], errors: {}, collection: {}, collectionMeta: null, orders: [], vendorHistory: [] } as Backup;
    const { next, counts } = planImport(readStoredValues(seeded(LOCAL)), old, "merge");
    expect(next.tradeLedger).toEqual(LOCAL.tradeLedger);
    expect(next.binderExcluded).toEqual(LOCAL.binderExcluded);
    expect(counts).toEqual({ newDecks: 0, newCards: 0, newOrders: 0, newTrades: 0 });
  });

  it("replace takes the backup as it is, cleaning only the ledger, exclude list and vendor cap", () => {
    const backup = { ...V1_BACKUP, vendorHistory: Array.from({ length: 60 }, (_, i) => `v${i}`) };
    const { next, counts } = planImport(readStoredValues(seeded(LOCAL)), backup, "replace");
    expect(next.decks.map(d => d.id)).toEqual(["d1", "d2"]);
    expect(next.errors).toEqual(V1_BACKUP.errors);
    expect(next.collection).toEqual(V1_BACKUP.collection);
    expect(next.collectionMeta).toEqual(V1_BACKUP.collectionMeta);
    expect(next.vendorHistory).toHaveLength(50);
    expect(next.tradeLedger.map(e => e.id)).toEqual(["t2", "t1"]);
    expect(next.binderExcluded).toEqual(["mana crypt"]);
    expect(counts).toEqual({ newDecks: 2, newCards: 2, newOrders: 2, newTrades: 2 });
  });

  it("replace with a partial backup empties every field it leaves out", () => {
    const { next } = planImport(readStoredValues(seeded(LOCAL)), { version: 1, orders: [order("o9")] } as unknown as Backup, "replace");
    expect(next).toEqual({ decks: [], errors: {}, collection: {}, collectionMeta: null, orders: [order("o9")], vendorHistory: [], tradeLedger: [], binderExcluded: [] });
  });

  it("tags the decks against the resulting Collection", () => {
    const ringDeck = { ...deck("d1"), cards: [{ id: "c1", name: "Sol Ring", quantity: 1, acquired: false }] };
    const { next } = planImport(readStoredValues(seeded({ decks: [ringDeck] })), { version: 1, collection: { "sol ring": [{ quantity: 1 }] } } as unknown as Backup, "merge");
    expect(next.decks[0].cards[0].source).toBe("owned");
  });
});

describe("importBackup", () => {
  it("writes every field, signals other tabs, leaves the toast for after the reload, and reloads", () => {
    const storage = seeded(LOCAL);
    const d = deps(storage);
    const result = importBackup(V1_BACKUP, { mode: "merge", source: "file" }, d);
    expect(result).toEqual({ ok: true, counts: { newDecks: 1, newCards: 1, newOrders: 1, newTrades: 1 } });
    expect(stored(storage, "decks").map((x: { id: string }) => x.id)).toEqual(["d1", "d2"]);
    expect(stored(storage, "binderExcluded")).toEqual(["sol ring", "mana crypt"]);
    expect(storage.getItem(BACKUP_IMPORTED_KEY)).toBe(String(NOW.getTime()));
    expect(JSON.parse(d.session.getItem(IMPORT_FLASH_KEY)!)).toEqual([
      { title: "Import complete", sub: "1 deck · 1 collection cards · 1 order · 1 trade added", variant: "success" },
    ]);
    expect(d.reload).toHaveBeenCalledOnce();
  });

  it("never touches the trade in progress", () => {
    const storage = seeded(LOCAL);
    storage.setItem("fetchlist-trade", '{"mine":[1],"theirs":[]}');
    importBackup(V1_BACKUP, { mode: "replace", source: "drive" }, deps(storage));
    expect(storage.getItem("fetchlist-trade")).toBe('{"mine":[1],"theirs":[]}');
  });

  it("puts everything back and doesn't reload when a write fails", () => {
    const storage = seeded(LOCAL);
    storage.failOn.add(KEYS.tradeLedger);
    const d = deps(storage);
    expect(importBackup(V1_BACKUP, { mode: "replace", source: "file" }, d)).toEqual({ ok: false, reason: "storage" });
    for (const field of Object.keys(LOCAL) as (keyof typeof LOCAL)[]) expect(stored(storage, field)).toEqual(LOCAL[field]);
    expect(storage.getItem(BACKUP_IMPORTED_KEY)).toBeNull();
    expect(d.session.getItem(IMPORT_FLASH_KEY)).toBeNull();
    expect(d.reload).not.toHaveBeenCalled();
  });

  it("removes keys that weren't there before when rolling back", () => {
    const storage = new MemoryStorage();
    storage.failOn.add(KEYS.binderExcluded);
    importBackup(V1_BACKUP, { mode: "replace", source: "file" }, deps(storage));
    expect(storage.getItem(KEYS.decks)).toBeNull();
  });

  it("refuses in demo mode and changes nothing", () => {
    const storage = seeded({ decks: [deck("sample")] });
    storage.setItem("fetchlist:demo:active", "true");
    const d = deps(storage);
    expect(importBackup(V1_BACKUP, { mode: "replace", source: "file" }, d)).toEqual({ ok: false, reason: "demo" });
    expect(stored(storage, "decks")).toEqual([deck("sample")]);
    expect(d.reload).not.toHaveBeenCalled();
  });

  it("still imports when sessionStorage is unavailable", () => {
    const storage = seeded({});
    const d = deps(storage);
    d.session.failOn.add(IMPORT_FLASH_KEY);
    expect(importBackup(V1_BACKUP, { mode: "merge", source: "file" }, d)).toMatchObject({ ok: true });
    expect(d.reload).toHaveBeenCalledOnce();
  });
});

describe("hasBackedUpUserData", () => {
  it("counts User data a Drive load would replace, deck errors included", () => {
    expect(hasBackedUpUserData(new MemoryStorage())).toBe(false);
    expect(hasBackedUpUserData(seeded({ errors: { d1: [] } }))).toBe(true);
    expect(hasBackedUpUserData(seeded({ decks: [deck("d1")] }))).toBe(true);
  });

  it("ignores Working state and the trade in progress, which a Drive load doesn't cost the user", () => {
    const storage = seeded({ vendorHistory: ["TCGplayer"], binderExcluded: ["x"], collectionMeta: LOCAL.collectionMeta, decks: [], collection: {} });
    storage.setItem("fetchlist-trade", '{"mine":[1],"theirs":[]}');
    expect(hasBackedUpUserData(storage)).toBe(false);
  });
});

describe("import toasts", () => {
  const zero = { newDecks: 0, newCards: 0, newOrders: 0, newTrades: 0 };

  it("summarises a file import, omitting zero counts and pluralising", () => {
    expect(importToasts("file", { ...zero, newDecks: 2, newCards: 3 }, false)).toEqual([
      { title: "Import complete", sub: "2 decks · 3 collection cards added", variant: "success" },
    ]);
    expect(importToasts("file", { ...zero, newDecks: 1, newOrders: 2 }, false)[0].sub).toBe("1 deck · 2 orders added");
    expect(importToasts("file", zero, false)).toEqual([
      { title: "Nothing new to import", sub: "All items already exist locally.", variant: "neutral", autoDismiss: 3000 },
    ]);
  });

  it("names a Drive load, and warns first about a newer format", () => {
    expect(importToasts("drive", zero, false).map(t => t.title)).toEqual(["Loaded from Drive"]);
    expect(importToasts("drive-conflict", zero, true).map(t => t.title)).toEqual(["Newer backup format", "Loaded Drive version"]);
  });

  it("are shown once", () => {
    const session = new MemoryStorage();
    session.setItem(IMPORT_FLASH_KEY, JSON.stringify(importToasts("drive", zero, false)));
    expect(consumeImportToasts(session).map(t => t.title)).toEqual(["Loaded from Drive"]);
    expect(consumeImportToasts(session)).toEqual([]);
  });
});
