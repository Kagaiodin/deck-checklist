import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LogTradeSheet } from "../LogTradeSheet";
import { LedgerPanel } from "../LedgerPanel";
import { DEFAULT_SETTINGS, type Trade, type TradeCard, type TradeLogEntry } from "../../../../types/trade";
import type { Collection, Deck } from "../../../../types/index";

const tc = (over: Partial<TradeCard> = {}): TradeCard => ({
  id: "i1", name: "Sol Ring", scryfallId: "x", set: "cmm", collectorNumber: "410", finish: "nonfoil", condition: "NM", quantity: 1,
  basePrice: 10, priceFetchedAt: 0, source: "search", ...over,
});
const trade = (mine: TradeCard[], theirs: TradeCard[] = []): Trade => ({
  mine: { cards: mine, cash: [] }, theirs: { cards: theirs, cash: [] }, settings: { ...DEFAULT_SETTINGS }, readOnly: false,
});
const deckWith = (name: string, quantity: number): Deck => ({
  id: "d", name: "Elves", createdAt: 0, cards: [{ id: "c1", name, quantity, acquired: true, color: [], type: "Artifact" }],
} as unknown as Deck);

const sheet = (t: Trade, collection: Collection, decks: Deck[] = [], onConfirm = vi.fn(), onCancel = vi.fn()) =>
  render(<LogTradeSheet trade={t} collection={collection} decks={decks} onCancel={onCancel} onConfirm={onConfirm} />);

describe("LogTradeSheet", () => {
  it("does not write anything until Log trade is pressed, then passes the form values", async () => {
    const onConfirm = vi.fn();
    sheet(trade([tc()]), { "sol ring": [{ quantity: 2 }] }, [], onConfirm);
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText("Who with"), "Sam");
    await userEvent.type(screen.getByLabelText("Notes"), "at FNM");
    await userEvent.click(screen.getByRole("button", { name: "Log trade" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ counterparty: "Sam", notes: "at FNM" });
    expect(typeof onConfirm.mock.calls[0][0].date).toBe("number");
  });

  it("warns when a card leaving is still in a deck, without blocking", async () => {
    sheet(trade([tc()]), { "sol ring": [{ quantity: 1 }] }, [deckWith("Sol Ring", 1)]);
    expect(screen.getByText("1 in decks")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/needed again/);
    expect(screen.getByRole("button", { name: "Log trade" })).toBeEnabled();
  });

  it("still flags a deck when the trade takes more copies than owned but some are owned", () => {
    // Own 1, trade out 2 (two lines): the deck loses its only copy, and the line must say so.
    sheet(trade([tc({ id: "a" }), tc({ id: "b" })]), { "sol ring": [{ quantity: 1 }] }, [deckWith("Sol Ring", 1)]);
    expect(screen.getAllByText("Not in your collection").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 in decks").length).toBeGreaterThan(0);
  });

  it("does not warn when the spare copies cover the trade", () => {
    sheet(trade([tc()]), { "sol ring": [{ quantity: 2 }] }, [deckWith("Sol Ring", 1)]);
    expect(screen.queryByText(/in decks/)).not.toBeInTheDocument();
  });

  it("notes a card that is not in the collection, without blocking", () => {
    sheet(trade([tc()]), {});
    expect(screen.getByText("Not in your collection")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log trade" })).toBeEnabled();
  });

  it("is disabled when both sides are empty", () => {
    sheet(trade([]), {});
    expect(screen.getByRole("button", { name: "Log trade" })).toBeDisabled();
  });

  it("Cancel closes without confirming", async () => {
    const onConfirm = vi.fn(), onCancel = vi.fn();
    sheet(trade([tc()]), {}, [], onConfirm, onCancel);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

const entry = (over: Partial<TradeLogEntry> = {}): TradeLogEntry => ({
  id: "e1", date: new Date(2026, 9, 1, 12).getTime(), counterparty: "Sam",
  cardsOut: [{ name: "Sol Ring", scryfallId: "x", set: "cmm", collectorNumber: "410", finish: "nonfoil", condition: "NM", quantity: 2, unitPrice: 9 }],
  cardsIn: [{ name: "Mana Crypt", scryfallId: "y", set: "2xm", collectorNumber: "1", finish: "foil", condition: "LP", quantity: 1, unitPrice: null }],
  cash: { out: 0, in: 5 }, totals: { out: 18, in: 5 }, ...over,
});

function Panel({ entries, openId = null, onDelete = vi.fn() }: { entries: TradeLogEntry[]; openId?: string | null; onDelete?: (id: string) => void }) {
  return <LedgerPanel entries={entries} openId={openId} onOpenChange={vi.fn()} onNewTrade={vi.fn()} onDelete={onDelete} />;
}

describe("LedgerPanel", () => {
  it("shows the empty state", () => {
    render(<Panel entries={[]} />);
    expect(screen.getByText("No trades yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New trade" })).toBeInTheDocument();
  });

  it("lists entries with counterparty, counts and cash", () => {
    render(<Panel entries={[entry()]} />);
    expect(screen.getByText("Sam")).toBeInTheDocument();
    expect(screen.getByText(/2 cards out · 1 card in · \$5\.00 cash in/)).toBeInTheDocument();
  });

  it("a receive-only trade shows what came in, not '0 cards out' or a zero given total", () => {
    render(<Panel entries={[entry({ cardsOut: [], cash: { out: 0, in: 0 }, totals: { out: 0, in: 12 }, cardsIn: [entry().cardsIn[0]] })]} />);
    expect(screen.getByText(/· 1 card in$/)).toBeInTheDocument();
    expect(screen.queryByText(/cards? out/)).not.toBeInTheDocument();
    expect(screen.queryByText("Gave")).not.toBeInTheDocument();
    expect(screen.getByText("Got")).toBeInTheDocument();
  });

  it("detail shows snapshot lines, 'no price' and the re-log footnote", () => {
    render(<Panel entries={[entry()]} openId="e1" />);
    const gave = screen.getByRole("region", { name: "You gave" });
    expect(within(gave).getByText(/2× Sol Ring/)).toBeInTheDocument();
    expect(within(gave).getByText("$18.00", { selector: "li span:last-child" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "You received" })).getByText("no price")).toBeInTheDocument();
    expect(screen.getByText("To correct a mistake, delete and re-log.")).toBeInTheDocument();
  });

  it("delete asks first, says Collection will not change back, then deletes", async () => {
    const onDelete = vi.fn();
    render(<Panel entries={[entry()]} openId="e1" onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete entry" }));
    const dialog = screen.getByRole("dialog", { name: "Delete this entry?" });
    expect(dialog).toHaveTextContent(/will not change back/);
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete entry" }));
    expect(onDelete).toHaveBeenCalledWith("e1");
  });
});
