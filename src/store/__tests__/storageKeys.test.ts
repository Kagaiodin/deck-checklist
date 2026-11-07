import { describe, it, expect } from "vitest";
import type { ProfileExport } from "../../types/index";
import { STORAGE_KEYS, keysOfKind } from "../storageKeys";

// Every ProfileExport field that holds saved data. Typed as a Record so adding a field to
// ProfileExport fails typecheck here until a registry entry claims it.
const BACKUP_FIELDS: Record<Exclude<keyof ProfileExport, "version" | "exportedAt">, true> = {
  decks: true,
  errors: true,
  collection: true,
  collectionMeta: true,
  orders: true,
  vendorHistory: true,
  tradeLedger: true,
  binderExcluded: true,
};

describe("storage-key registry", () => {
  // Pinned by value: these are real users' saved keys. A renamed key strands their data.
  it("sorts the keys into User data, Working state and Preference", () => {
    expect([...keysOfKind("user-data")].sort()).toEqual([
      "fetchlist-trade",
      "mtg-checklist-collection-v2",
      "mtg-checklist-decks",
      "mtg-checklist-errors",
      "mtg-checklist-orders-v1",
      "mtg-checklist-trade-ledger-v1",
    ]);
    expect([...keysOfKind("working-state")].sort()).toEqual([
      "fetchlist-coachmark-dismissed-decks",
      "fetchlist-last-vendor",
      "fetchlist-vendor-last-used",
      "fetchlist:onboarding:dismissed",
      "mtg-checklist-binder-excluded-v1",
      "mtg-checklist-collection-meta-v2",
      "mtg-checklist-vendor-history",
    ]);
    expect([...keysOfKind("preference")].sort()).toEqual([
      "fetchlist:extrainfo-open",
      "fl-sidebar-collapsed",
      "fl-theme-accent",
      "fl-theme-mode",
    ]);
  });

  it("registers each key once", () => {
    const keys = STORAGE_KEYS.map(e => e.key);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("saves each backup field from exactly one key", () => {
    const claimed = STORAGE_KEYS.flatMap(e => (e.backup === false ? [] : [e.backup]));
    expect([...claimed].sort()).toEqual(Object.keys(BACKUP_FIELDS).sort());
  });

  it("says why any User data is left out of backups", () => {
    const unexplained = STORAGE_KEYS.filter(e => e.kind === "user-data" && e.backup === false && !("reason" in e && e.reason.trim()));
    expect(unexplained.map(e => e.key)).toEqual([]);
    const skipped = STORAGE_KEYS.filter(e => e.kind === "user-data" && e.backup === false).map(e => e.key);
    expect(skipped).toEqual(["fetchlist-trade"]);
  });
});
