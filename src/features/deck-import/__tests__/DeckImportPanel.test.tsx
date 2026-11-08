import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Card } from "../../../types/index";
import { useState } from "react";
import { DeckImportPanel } from "../DeckImportPanel";
import { EMPTY_IMPORT_DRAFT, type ImportDraft } from "../deckImport";

const validateDecklist = vi.hoisted(() => vi.fn());
vi.mock("../../../utils/validator", () => ({ validateDecklist }));

const card = (name: string, quantity: number): Card => ({ id: name, name, quantity, acquired: false, color: [], type: "Instant" });

beforeEach(() => {
  validateDecklist.mockReset();
  validateDecklist.mockImplementation(async (parsed: { count: number; name: string }[]) => ({
    cards: parsed.map(p => card(p.name, p.count)),
    errors: [],
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

function setup() {
  const onImported = vi.fn();
  const onCancel = vi.fn();
  function Harness() {
    const [draft, setDraft] = useState<ImportDraft>(EMPTY_IMPORT_DRAFT);
    return <DeckImportPanel draft={draft} setDraft={setDraft} onImported={onImported} onCancel={onCancel} />;
  }
  render(<Harness />);
  return { onImported, onCancel, user: userEvent.setup() };
}

const importButton = () => screen.getByRole("button", { name: "Import & Validate" });
const decklistBox = () => screen.getByPlaceholderText(/4 Lightning Bolt/);

describe("DeckImportPanel", () => {
  it("enables import only once there is a Decklist", async () => {
    const { user } = setup();
    expect(importButton()).toBeDisabled();
    await user.type(decklistBox(), "1 Sol Ring");
    expect(importButton()).toBeEnabled();
  });

  it("hands back the looked-up deck with its name, URL, format and Built choice", async () => {
    const { user, onImported } = setup();
    await user.type(screen.getByPlaceholderText("Deck name (optional)"), "  Rings  ");
    await user.type(screen.getByPlaceholderText(/Deck URL/), "https://example.com/deck");
    await user.selectOptions(screen.getByRole("combobox", { name: "Deck format" }), "commander");
    await user.click(screen.getByRole("checkbox", { name: "This deck is already built" }));
    await user.type(decklistBox(), "1 Sol Ring");
    await user.click(importButton());
    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(onImported).toHaveBeenCalledWith({
      name: "Rings",
      url: "https://example.com/deck",
      format: "commander",
      built: true,
      cards: [card("Sol Ring", 1)],
      errors: [],
    });
  });

  it("shows why a Decklist with no card lines can't be imported", async () => {
    const { user, onImported } = setup();
    await user.type(decklistBox(), "Sol Ring");
    await user.click(importButton());
    expect(await screen.findByText(/No valid card lines found/)).toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
  });

  it("shows a failed lookup and stays open", async () => {
    validateDecklist.mockRejectedValue(new Error("Scryfall is down"));
    const { user, onImported } = setup();
    await user.type(decklistBox(), "1 Sol Ring");
    await user.click(importButton());
    expect(await screen.findByText("Scryfall is down")).toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
    expect(importButton()).toBeEnabled();
  });

  it("Cancel calls onCancel", async () => {
    const { user, onCancel } = setup();
    await user.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("fetches an Archidekt deck into the Decklist and names the deck", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ name: "Elves", cards: [{ quantity: 1, categories: [], card: { oracleCard: { name: "Selvala" } } }] }),
    })));
    const { user } = setup();
    expect(screen.queryByRole("button", { name: "Fetch from Archidekt" })).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/Deck URL/), "https://archidekt.com/decks/42/elves");
    await user.click(screen.getByRole("button", { name: "Fetch from Archidekt" }));
    await waitFor(() => expect(decklistBox()).toHaveValue("1 Selvala"));
    expect(screen.getByPlaceholderText("Deck name (optional)")).toHaveValue("Elves");
  });

  it("keeps a name the user typed when fetching from Archidekt", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ name: "Elves", cards: [] }) })));
    const { user } = setup();
    await user.type(screen.getByPlaceholderText("Deck name (optional)"), "Mine");
    await user.type(screen.getByPlaceholderText(/Deck URL/), "archidekt.com/decks/42");
    await user.click(screen.getByRole("button", { name: "Fetch from Archidekt" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Fetch from Archidekt" })).toBeEnabled());
    expect(screen.getByPlaceholderText("Deck name (optional)")).toHaveValue("Mine");
  });

  it("shows a failed Archidekt fetch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    const { user } = setup();
    await user.type(screen.getByPlaceholderText(/Deck URL/), "archidekt.com/decks/42");
    await user.click(screen.getByRole("button", { name: "Fetch from Archidekt" }));
    expect(await screen.findByText("Archidekt returned 404 — is the deck public?")).toBeInTheDocument();
  });
});
