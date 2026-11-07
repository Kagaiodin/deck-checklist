import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test/renderApp";
import { COLLECTION_KEY, COLLECTION_META_KEY } from "../features/collection/storageKeys";

// App-level regression: App and CollectionPage each hold a copy of the Collection.
// Edits made on the Collection page must survive a later "Mark received" on an order.

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});
afterEach(() => vi.unstubAllGlobals());

describe("receiving an order after editing the Collection", () => {
  it("keeps cards added on the Collection page", async () => {
    const user = userEvent.setup();
    const { stored } = renderApp({ storage: { "mtg-checklist-orders-v1": JSON.stringify([
      { id: "o1", createdAt: 1, vendor: "ManaPool", status: "active", cards: [{ cardName: "Sol Ring", quantity: 1 }] },
    ]) } });

    await user.click(screen.getByRole("button", { name: /^Collection/ }));
    await user.click(screen.getByRole("button", { name: "+ Add" }));
    await user.type(screen.getByPlaceholderText("Card name…"), "Counterspell");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(stored(COLLECTION_KEY)).toHaveProperty("counterspell"));

    await user.click(screen.getByRole("button", { name: /^Transactions/ }));
    await user.click(screen.getAllByRole("button", { name: /Mark received/ })[0]);

    await waitFor(() => expect(stored(COLLECTION_KEY)).toHaveProperty(["sol ring"]));
    expect(Object.keys(stored(COLLECTION_KEY)).sort()).toEqual(["counterspell", "sol ring"]);
    // Quick-add created the meta on the Collection page; receiving must update it, not replace it.
    expect(stored(COLLECTION_META_KEY)).toMatchObject({ fileName: "Manual entries", cardCount: 2 });
  });
});
