import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test/renderApp";
import { COLLECTION_KEY, COLLECTION_META_KEY } from "../store/storageKeys";
import type { ProfileExport } from "../types/index";

// App-level: a backup import works against the one live Collection.

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

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
    const { stored } = renderApp({ storage: {
      [COLLECTION_KEY]: JSON.stringify({ "lightning bolt": [{ quantity: 4 }] }),
      [COLLECTION_META_KEY]: JSON.stringify({ fileName: "mine.csv", importedAt: 1, cardCount: 1 }),
    } });

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
  const ringSource = (stored: ReturnType<typeof renderApp>["stored"]) => stored("mtg-checklist-decks")?.[0]?.cards[0]?.source;

  it("re-tags decks against the merged Collection", async () => {
    const user = userEvent.setup();
    const { stored } = renderApp({ storage: { "mtg-checklist-decks": JSON.stringify([deck()]) } });
    await importBackup(user, { collection: { "sol ring": [{ quantity: 1 }] } });
    await waitFor(() => expect(ringSource(stored)).toBe("owned"));
  });

  it("re-tags the restored decks against the restored Collection on replace", async () => {
    const user = userEvent.setup();
    const { stored } = renderApp();
    await importBackup(user, { decks: [deck()] as ProfileExport["decks"], collection: { "sol ring": [{ quantity: 1 }] } }, { replace: true });
    await waitFor(() => expect(stored("mtg-checklist-decks")).toHaveLength(1));
    await waitFor(() => expect(ringSource(stored)).toBe("owned"));
  });
});
