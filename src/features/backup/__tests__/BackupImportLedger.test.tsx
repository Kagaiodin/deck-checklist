import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../../../test/renderApp";

// App-level backup import for the trade ledger and Binder exclude list
// (spec §11: new fields round-trip, old backups without them, merge dedupes by id).

const LEDGER_KEY = "mtg-checklist-trade-ledger-v1";
const EXCLUDED_KEY = "mtg-checklist-binder-excluded-v1";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

const entry = (id: string, date: number) => ({ id, date, cardsOut: [], cardsIn: [], cash: { out: 0, in: 3 }, totals: { out: 0, in: 3 } });
const backup = (extra: Record<string, unknown>) => ({
  version: 1, exportedAt: "2026-01-01T00:00:00.000Z", decks: [], errors: {}, collection: {}, collectionMeta: null, orders: [], vendorHistory: [], ...extra,
});

/** Opens the Import backup modal and feeds it a backup file (jsdom has no file picker, so the hidden input is used). */
async function importBackup(data: unknown, replace = false) {
  await userEvent.click(screen.getByRole("button", { name: "↑ Import backup" }));
  const dialog = screen.getByRole("dialog", { name: "Import backup" });
  if (replace) await userEvent.click(within(dialog).getByLabelText(/Replace all local data/));
  const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [new File([JSON.stringify(data)], "fetchlist-backup.json", { type: "application/json" })] } });
}

describe("Import backup — trade ledger and Binder exclude list", () => {
  it("merge adds only new ledger entries (deduped by id), unions the exclude list, and reports the trade count", async () => {
    const { stored, reload, remount } = renderApp({ storage: { [LEDGER_KEY]: JSON.stringify([entry("a", 10)]), [EXCLUDED_KEY]: JSON.stringify(["sol ring"]) } });
    await importBackup(backup({ tradeLedger: [entry("a", 10), entry("b", 20), { id: "bad" }], binderExcluded: ["sol ring", "mana crypt"] }));
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    remount();
    expect(stored(LEDGER_KEY)).toHaveLength(2);
    expect(stored(LEDGER_KEY).map((e: { id: string }) => e.id)).toEqual(["b", "a"]); // newest first, malformed entry dropped
    expect([...stored(EXCLUDED_KEY)].sort()).toEqual(["mana crypt", "sol ring"]);
    expect(await screen.findByText(/1 trade added/)).toBeInTheDocument();
  });

  it("replace restores the ledger and exclude list from the backup", async () => {
    const { stored, reload, remount } = renderApp({ storage: { [LEDGER_KEY]: JSON.stringify([entry("old", 5)]), [EXCLUDED_KEY]: JSON.stringify(["old card"]) } });
    await importBackup(backup({ tradeLedger: [entry("new", 50)], binderExcluded: ["sol ring"] }), true);
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    remount();
    expect(stored(LEDGER_KEY).map((e: { id: string }) => e.id)).toEqual(["new"]);
    expect(stored(EXCLUDED_KEY)).toEqual(["sol ring"]);
    expect(await screen.findByText(/1 trade added/)).toBeInTheDocument();
  });

  it("replace with an old backup (no ledger fields) empties the ledger and exclude list", async () => {
    const { stored } = renderApp({ storage: { [LEDGER_KEY]: JSON.stringify([entry("old", 5)]), [EXCLUDED_KEY]: JSON.stringify(["old card"]) } });
    await importBackup(backup({}), true);
    await waitFor(() => expect(stored(LEDGER_KEY) ?? []).toEqual([]));
    expect(stored(EXCLUDED_KEY) ?? []).toEqual([]);
  });

  it("merge with an old backup (no ledger fields) leaves the ledger and exclude list alone", async () => {
    const { stored, reload, remount } = renderApp({ storage: { [LEDGER_KEY]: JSON.stringify([entry("keep", 5)]), [EXCLUDED_KEY]: JSON.stringify(["keep card"]) } });
    await importBackup(backup({ orders: [] }));
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    remount();
    expect(await screen.findByText("Nothing new to import")).toBeInTheDocument();
    expect(stored(LEDGER_KEY)).toHaveLength(1);
    expect(stored(EXCLUDED_KEY)).toEqual(["keep card"]);
  });
});
