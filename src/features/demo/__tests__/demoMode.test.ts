import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorage } from "./memoryStorage";
import { enterDemo, exitDemo, isDemoActive, hasRealData, refreshDemo, MANAGED_KEYS } from "../demoMode";

const THEME_KEY = "fl-theme-mode";

describe("demoMode", () => {
  let localStorage: MemoryStorage;
  beforeEach(() => { localStorage = new MemoryStorage(); });

  it("enter replaces managed keys and exit restores them exactly, removing originally absent keys", () => {
    localStorage.setItem("mtg-checklist-decks", '[{"id":"real"}]');
    localStorage.setItem(THEME_KEY, "light");
    // mtg-checklist-orders-v1 deliberately absent

    const result = enterDemo(localStorage, { "mtg-checklist-decks": '[{"id":"demo"}]', "mtg-checklist-orders-v1": "[1]" }, "settings");

    expect(result).toEqual({ ok: true });
    expect(isDemoActive(localStorage)).toBe(true);
    expect(localStorage.getItem("mtg-checklist-decks")).toBe('[{"id":"demo"}]');
    expect(localStorage.getItem("mtg-checklist-orders-v1")).toBe("[1]");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");

    exitDemo(localStorage);

    expect(isDemoActive(localStorage)).toBe(false);
    expect(localStorage.getItem("mtg-checklist-decks")).toBe('[{"id":"real"}]');
    expect(localStorage.getItem("mtg-checklist-orders-v1")).toBeNull();
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(localStorage.getItem("fetchlist:demo:snapshot")).toBeNull();
    expect(localStorage.getItem("fetchlist:demo:source")).toBeNull();
  });

  // Pinned by value: these are real users' saved keys. A renamed or dropped key strands their data.
  it("manages exactly the User data and Working state keys", () => {
    expect([...MANAGED_KEYS].sort()).toEqual([
      "fetchlist-coachmark-dismissed-decks",
      "fetchlist-last-vendor",
      "fetchlist-trade",
      "fetchlist-vendor-last-used",
      "fetchlist:onboarding:dismissed",
      "mtg-checklist-binder-excluded-v1",
      "mtg-checklist-collection-meta-v2",
      "mtg-checklist-collection-v2",
      "mtg-checklist-decks",
      "mtg-checklist-errors",
      "mtg-checklist-orders-v1",
      "mtg-checklist-trade-ledger-v1",
      "mtg-checklist-vendor-history",
    ]);
  });

  it("never manages UI preference keys", () => {
    for (const k of ["fl-theme-mode", "fl-theme-accent", "fl-sidebar-collapsed", "fetchlist:extrainfo-open"]) {
      expect(MANAGED_KEYS).not.toContain(k);
    }
  });

  it("is a no-op when demo is already active (snapshot is not overwritten)", () => {
    localStorage.setItem("mtg-checklist-decks", "real");
    enterDemo(localStorage, { "mtg-checklist-decks": "demo1" }, "settings");
    const second = enterDemo(localStorage, { "mtg-checklist-decks": "demo2" }, "link");

    expect(second).toEqual({ ok: true });
    expect(localStorage.getItem("mtg-checklist-decks")).toBe("demo1");
    exitDemo(localStorage);
    expect(localStorage.getItem("mtg-checklist-decks")).toBe("real");
  });

  it("aborts without touching data when the snapshot cannot be written", () => {
    localStorage.setItem("mtg-checklist-decks", "real");
    localStorage.failOn.add("fetchlist:demo:snapshot");

    const result = enterDemo(localStorage, { "mtg-checklist-decks": "demo" }, "settings");

    expect(result).toEqual({ ok: false });
    expect(localStorage.getItem("mtg-checklist-decks")).toBe("real");
    expect(isDemoActive(localStorage)).toBe(false);
  });

  it("rolls back to the original data when writing demo values fails midway", () => {
    localStorage.setItem("mtg-checklist-decks", "real");
    localStorage.setItem("mtg-checklist-orders-v1", "real-orders");
    localStorage.failOn.add("mtg-checklist-orders-v1");

    const result = enterDemo(
      localStorage,
      { "mtg-checklist-decks": "demo", "mtg-checklist-orders-v1": "demo-orders" },
      "settings",
    );

    expect(result).toEqual({ ok: false });
    expect(isDemoActive(localStorage)).toBe(false);
    expect(localStorage.getItem("mtg-checklist-decks")).toBe("real");
    expect(localStorage.getItem("mtg-checklist-orders-v1")).toBe("real-orders");
    expect(localStorage.getItem("fetchlist:demo:snapshot")).toBeNull();
  });

  describe("refreshDemo", () => {
    it("rewrites a session from older sample data, and Exit still restores the real data", () => {
      localStorage.setItem("mtg-checklist-decks", "real");
      enterDemo(localStorage, { "mtg-checklist-decks": "demo-v1", "mtg-checklist-orders-v1": "old-orders" }, "settings", "v1");

      expect(refreshDemo(localStorage, { "mtg-checklist-decks": "demo-v2", "mtg-checklist-trade-ledger-v1": "[2]" }, "v2")).toBe(true);

      expect(localStorage.getItem("mtg-checklist-decks")).toBe("demo-v2");
      expect(localStorage.getItem("mtg-checklist-trade-ledger-v1")).toBe("[2]");
      expect(localStorage.getItem("mtg-checklist-orders-v1")).toBeNull();
      expect(localStorage.getItem("fetchlist:demo:version")).toBe("v2");
      exitDemo(localStorage);
      expect(localStorage.getItem("mtg-checklist-decks")).toBe("real");
      expect(localStorage.getItem("mtg-checklist-trade-ledger-v1")).toBeNull();
      expect(localStorage.getItem("fetchlist:demo:version")).toBeNull();
    });

    it("treats a session with no fingerprint (started before fingerprints) as stale", () => {
      enterDemo(localStorage, { "mtg-checklist-decks": "demo-old" }, "settings");
      expect(refreshDemo(localStorage, { "mtg-checklist-decks": "demo-new" }, "v2")).toBe(true);
      expect(localStorage.getItem("mtg-checklist-decks")).toBe("demo-new");
    });

    it("leaves an up-to-date session alone, so demo edits survive a reload", () => {
      enterDemo(localStorage, { "mtg-checklist-decks": "demo" }, "settings", "v1");
      localStorage.setItem("mtg-checklist-decks", "demo-edited");
      expect(refreshDemo(localStorage, { "mtg-checklist-decks": "demo" }, "v1")).toBe(false);
      expect(localStorage.getItem("mtg-checklist-decks")).toBe("demo-edited");
    });

    it("never writes when demo is not active", () => {
      localStorage.setItem("mtg-checklist-decks", "real");
      expect(refreshDemo(localStorage, { "mtg-checklist-decks": "demo" }, "v1")).toBe(false);
      expect(localStorage.getItem("mtg-checklist-decks")).toBe("real");
      expect(localStorage.getItem("fetchlist:demo:version")).toBeNull();
    });

    it("keeps the old fingerprint when a write fails, so the next load retries", () => {
      enterDemo(localStorage, { "mtg-checklist-decks": "demo" }, "settings", "v1");
      localStorage.failOn.add("mtg-checklist-orders-v1");
      expect(refreshDemo(localStorage, { "mtg-checklist-decks": "demo2", "mtg-checklist-orders-v1": "x" }, "v2")).toBe(false);
      expect(localStorage.getItem("fetchlist:demo:version")).toBe("v1");
      expect(isDemoActive(localStorage)).toBe(true);
    });
  });

  it("exit is a no-op when demo is not active (a second tab's late Exit must not wipe restored data)", () => {
    localStorage.setItem("mtg-checklist-decks", "restored-real");

    expect(exitDemo(localStorage)).toEqual({ recovered: false });

    expect(localStorage.getItem("mtg-checklist-decks")).toBe("restored-real");
  });

  describe("exit with a missing or corrupt snapshot", () => {
    it.each([
      ["missing", null],
      ["corrupt", "{not json"],
    ])("clears managed keys and reports recovery (%s)", (_label, snapshot) => {
      localStorage.setItem("fetchlist:demo:active", "true");
      if (snapshot !== null) localStorage.setItem("fetchlist:demo:snapshot", snapshot);
      localStorage.setItem("mtg-checklist-decks", "demo");
      localStorage.setItem("fl-theme-mode", "light");

      const result = exitDemo(localStorage);

      expect(result).toEqual({ recovered: true });
      expect(localStorage.getItem("mtg-checklist-decks")).toBeNull();
      expect(localStorage.getItem("fl-theme-mode")).toBe("light");
      expect(isDemoActive(localStorage)).toBe(false);
    });

    it("reports a clean exit when the snapshot is valid", () => {
      enterDemo(localStorage, {}, "settings");
      expect(exitDemo(localStorage)).toEqual({ recovered: false });
    });
  });

  describe("hasRealData", () => {
    it("is false for a fresh user and for default-empty values", () => {
      expect(hasRealData(localStorage)).toBe(false);
      localStorage.setItem("mtg-checklist-decks", "[]");
      localStorage.setItem("mtg-checklist-collection-v2", "{}");
      localStorage.setItem("mtg-checklist-orders-v1", "[]");
      localStorage.setItem("mtg-checklist-collection-meta-v2", "null");
      localStorage.setItem(
        "fetchlist-trade",
        JSON.stringify({ mine: { cards: [], cash: [] }, theirs: { cards: [], cash: [] }, settings: {} }),
      );
      expect(hasRealData(localStorage)).toBe(false);
    });

    it.each([
      ["mtg-checklist-decks", '[{"id":"d1"}]'],
      ["mtg-checklist-collection-v2", '{"Sol Ring":{"owned":1}}'],
      ["mtg-checklist-orders-v1", '[{"id":"o1"}]'],
      ["fetchlist-trade", JSON.stringify({ mine: { cards: [{ id: "c" }], cash: [] }, theirs: { cards: [], cash: [] } })],
      ["mtg-checklist-errors", '{"d1":[{"name":"Sol Ring"}]}'],
      ["mtg-checklist-trade-ledger-v1", '[{"id":"t1"}]'],
    ])("is true when %s holds data", (key, value) => {
      localStorage.setItem(key, value);
      expect(hasRealData(localStorage)).toBe(true);
    });

    it.each([
      ["mtg-checklist-collection-meta-v2", '{"fileName":"a.csv","importedAt":1,"cardCount":3}'],
      ["mtg-checklist-vendor-history", '["Card Kingdom"]'],
      ["mtg-checklist-binder-excluded-v1", '["c1"]'],
      ["fetchlist-last-vendor", '"Card Kingdom"'],
      ["fetchlist-vendor-last-used", '{"Card Kingdom":1}'],
      ["fetchlist:onboarding:dismissed", "true"],
      ["fetchlist-coachmark-dismissed-decks", '["d1"]'],
    ])("is false when only the Working state key %s holds data", (key, value) => {
      localStorage.setItem(key, value);
      expect(hasRealData(localStorage)).toBe(false);
    });

    it("treats unparseable values as real data (never silently overwrite)", () => {
      localStorage.setItem("mtg-checklist-decks", "{oops");
      expect(hasRealData(localStorage)).toBe(true);
    });
  });
});
