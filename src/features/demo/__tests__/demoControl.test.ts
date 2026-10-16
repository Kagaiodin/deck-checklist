import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { MemoryStorage } from "./memoryStorage";
import { bootDemoFromUrl, startDemo, leaveDemo, hasPendingLinkConfirm, clearPendingLinkConfirm, RECOVERED_FLAG } from "../demoControl";
import { isDemoActive } from "../demoMode";

const NOW = Date.UTC(2026, 9, 16, 12);

let storage: MemoryStorage;
let session: MemoryStorage;
let reload: Mock<() => void>;
const deps = () => ({ storage, session, reload, now: () => NOW });

beforeEach(() => {
  storage = new MemoryStorage();
  session = new MemoryStorage();
  reload = vi.fn<() => void>();
  window.history.replaceState({}, "", "/");
});

describe("startDemo", () => {
  it("writes demo data, marks demo active, and reloads", async () => {
    expect(await startDemo("settings", deps())).toBe(true);
    expect(isDemoActive(storage)).toBe(true);
    expect(JSON.parse(storage.getItem("mtg-checklist-decks")!)).toHaveLength(3);
    expect(storage.getItem("fetchlist:demo:source")).toBe("settings");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does not reload and leaves data alone when the snapshot cannot be saved", async () => {
    storage.setItem("mtg-checklist-decks", "real");
    storage.failOn.add("fetchlist:demo:snapshot");
    expect(await startDemo("settings", deps())).toBe(false);
    expect(storage.getItem("mtg-checklist-decks")).toBe("real");
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("leaveDemo", () => {
  it("restores the user's data and reloads", async () => {
    storage.setItem("mtg-checklist-decks", "real");
    await startDemo("settings", deps());
    reload.mockClear();

    leaveDemo(deps());

    expect(storage.getItem("mtg-checklist-decks")).toBe("real");
    expect(isDemoActive(storage)).toBe(false);
    expect(session.getItem(RECOVERED_FLAG)).toBeNull();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("flags recovery for a warning toast when the snapshot was unusable", () => {
    storage.setItem("fetchlist:demo:active", "true");
    leaveDemo(deps());
    expect(session.getItem(RECOVERED_FLAG)).toBe("1");
    expect(reload).toHaveBeenCalledOnce();
  });
});

describe("bootDemoFromUrl", () => {
  it("does nothing without the param", async () => {
    expect(await bootDemoFromUrl(deps())).toBe("none");
    expect(isDemoActive(storage)).toBe(false);
  });

  it("enters demo for a fresh user without reloading, and strips the param", async () => {
    window.history.replaceState({}, "", "/?demo=true&x=1#decks");

    expect(await bootDemoFromUrl(deps())).toBe("entered");

    expect(isDemoActive(storage)).toBe(true);
    expect(storage.getItem("fetchlist:demo:source")).toBe("link");
    expect(reload).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?x=1");
    expect(window.location.hash).toBe("#decks");
  });

  it("asks for confirmation instead of writing when the user has real data", async () => {
    storage.setItem("mtg-checklist-decks", '[{"id":"d1"}]');
    window.history.replaceState({}, "", "/?demo=true");

    expect(await bootDemoFromUrl(deps())).toBe("needs-confirm");

    expect(isDemoActive(storage)).toBe(false);
    expect(storage.getItem("mtg-checklist-decks")).toBe('[{"id":"d1"}]');
    expect(window.location.search).toBe("");
    // the app picks this up once to render the confirmation
    expect(hasPendingLinkConfirm()).toBe(true);
    expect(hasPendingLinkConfirm()).toBe(true); // peeking is safe under StrictMode double-invoke
    clearPendingLinkConfirm();
    expect(hasPendingLinkConfirm()).toBe(false);
  });

  it("ignores the param when demo is already active", async () => {
    await startDemo("settings", deps());
    const before = storage.getItem("fetchlist:demo:source");
    window.history.replaceState({}, "", "/?demo=true");

    expect(await bootDemoFromUrl(deps())).toBe("none");

    expect(storage.getItem("fetchlist:demo:source")).toBe(before);
    expect(window.location.search).toBe("");
  });

  it("ignores other values of the param", async () => {
    window.history.replaceState({}, "", "/?demo=false");
    expect(await bootDemoFromUrl(deps())).toBe("none");
    expect(isDemoActive(storage)).toBe(false);
  });
});
