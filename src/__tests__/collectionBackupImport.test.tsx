import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { COLLECTION_KEY, COLLECTION_META_KEY } from "../features/collection/storageKeys";
import type { ProfileExport } from "../types/index";

// App-level: a backup import works against the one live Collection.

let store: Map<string, string>;

beforeEach(() => {
  store = new Map([["fetchlist:onboarding:dismissed", "true"]]);
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear() },
    writable: true, configurable: true,
  });
  Object.defineProperty(globalThis, "matchMedia", {
    configurable: true, writable: true,
    value: (query: string) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }),
  });
  vi.stubGlobal("scrollTo", vi.fn());
  window.history.replaceState(null, "", "/");
});
afterEach(() => vi.unstubAllGlobals());

const stored = (k: string) => JSON.parse(store.get(k) ?? "null");

async function importBackup(user: ReturnType<typeof userEvent.setup>, backup: Partial<ProfileExport>, { replace = false } = {}) {
  await user.click(screen.getByRole("button", { name: /^Decks/ }));
  await user.click(screen.getAllByRole("button", { name: /Import backup/ })[0]);
  if (replace) await user.click(screen.getByLabelText(/Replace all local data/));
  const input = document.querySelector<HTMLInputElement>('input[type="file"][accept=".json"]')!;
  const file = new File([JSON.stringify({ version: 1, exportedAt: "", ...backup })], "fetchlist-backup.json", { type: "application/json" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("importing a backup", () => {
  it("merges into the Collection as edited on the Collection page, not a stale copy", async () => {
    const user = userEvent.setup();
    store.set(COLLECTION_KEY, JSON.stringify({ "lightning bolt": [{ quantity: 4 }] }));
    store.set(COLLECTION_META_KEY, JSON.stringify({ fileName: "mine.csv", importedAt: 1, cardCount: 1 }));
    render(<App />);

    await user.click(screen.getByRole("button", { name: /^Collection/ }));
    await user.click(screen.getByRole("button", { name: "+ Add" }));
    await user.type(screen.getByPlaceholderText("Card name…"), "Counterspell");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(stored(COLLECTION_KEY)).toHaveProperty("counterspell"));

    await importBackup(user, { collection: { "sol ring": [{ quantity: 1 }] } });

    await waitFor(() => expect(stored(COLLECTION_KEY)).toHaveProperty(["sol ring"]));
    expect(Object.keys(stored(COLLECTION_KEY)).sort()).toEqual(["counterspell", "lightning bolt", "sol ring"]);
    expect(stored(COLLECTION_META_KEY)).toEqual({ fileName: "mine.csv", importedAt: 1, cardCount: 3 });
  });

  const deck = (source?: string) => ({
    id: "d1", name: "Atraxa", createdAt: 1,
    cards: [{ id: "c1", name: "Sol Ring", quantity: 1, acquired: false, color: [], type: "Artifact", source }],
  });
  const ringSource = () => stored("mtg-checklist-decks")?.[0]?.cards[0]?.source;

  it("re-tags decks against the merged Collection", async () => {
    const user = userEvent.setup();
    store.set("mtg-checklist-decks", JSON.stringify([deck()]));
    render(<App />);
    await importBackup(user, { collection: { "sol ring": [{ quantity: 1 }] } });
    await waitFor(() => expect(ringSource()).toBe("owned"));
  });

  it("re-tags the restored decks against the restored Collection on replace", async () => {
    const user = userEvent.setup();
    render(<App />);
    await importBackup(user, { decks: [deck()] as ProfileExport["decks"], collection: { "sol ring": [{ quantity: 1 }] } }, { replace: true });
    await waitFor(() => expect(stored("mtg-checklist-decks")).toHaveLength(1));
    await waitFor(() => expect(ringSource()).toBe("owned"));
  });
});
