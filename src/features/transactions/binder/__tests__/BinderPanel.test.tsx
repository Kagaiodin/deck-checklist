import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BinderPanel } from "../BinderPanel";
import { useBinder } from "../useBinder";
import type { Collection, Deck } from "../../../../types/index";

vi.mock("../../../../hooks/useMediaQuery", () => ({ useMediaQuery: vi.fn(() => false) }));
import { useMediaQuery } from "../../../../hooks/useMediaQuery";


// Node's built-in localStorage can shadow jsdom's; use an in-memory mock.
function installStorage(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  const mock = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };
  for (const target of [globalThis, window]) {
    Object.defineProperty(target, "localStorage", { value: mock, writable: true, configurable: true });
  }
}

const deck = (cards: Array<[string, number]>): Deck => ({
  id: "d1", name: "Deck One", importedAt: 0,
  cards: cards.map(([name, quantity], i) => ({ id: `c${i}`, name, quantity, acquired: true }) as Deck["cards"][number]),
} as unknown as Deck);

function Harness({ collection, decks = [], onAddToTrade = vi.fn(), onNewTrade = vi.fn() }: {
  collection: Collection; decks?: Deck[]; onAddToTrade?: () => void; onNewTrade?: () => void;
}) {
  const binder = useBinder(collection, decks);
  return <BinderPanel collection={collection} binder={binder} onNewTrade={onNewTrade} onAddToTrade={onAddToTrade} onViewCollection={vi.fn()} />;
}

const owned: Collection = {
  "sol ring": [{ quantity: 4, set: "cmm", foil: true }],
  "rhystic study": [{ quantity: 3 }],
  "command tower": [{ quantity: 2 }],
};

beforeEach(() => {
  installStorage();
  vi.mocked(useMediaQuery).mockReturnValue(false);
});

describe("BinderPanel", () => {
  it("lists spare cards with partial-stack wording and no prices", () => {
    render(<Harness collection={owned} decks={[deck([["Sol Ring", 3], ["Command Tower", 2]])]} />);
    const items = within(screen.getByRole("list", { name: "Spare cards" })).getAllByRole("listitem");
    expect(items.map(li => li.querySelector(".binder-row-name")?.textContent)).toEqual(["Rhystic Study", "Sol Ring"]);
    expect(items[1]).toHaveTextContent("CMM · Foil · 4 owned · 3 in decks");
    expect(items[1]).toHaveTextContent("1spare");
    expect(document.body.textContent).not.toMatch(/\$/);
  });

  it("excludes a card with an Undo toast, lists it under Keep these, and restores it", async () => {
    render(<Harness collection={owned} />);
    await userEvent.click(screen.getByRole("button", { name: "Exclude Sol Ring from Binder" }));
    expect(screen.queryByRole("button", { name: "Exclude Sol Ring from Binder" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Sol Ring kept out of Binder.");
    expect(JSON.parse(localStorage.getItem("mtg-checklist-binder-excluded-v1")!)).toEqual(["sol ring"]);

    await userEvent.click(screen.getByRole("button", { name: "Keep these 1" }));
    const kept = screen.getByRole("list", { name: "Kept out of Binder" });
    await userEvent.click(within(kept).getByRole("button", { name: "Show in Binder: Sol Ring" }));
    expect(screen.getByRole("button", { name: "Exclude Sol Ring from Binder" })).toBeInTheDocument();
  });

  it("Undo on the toast puts the card back", async () => {
    render(<Harness collection={owned} />);
    await userEvent.click(screen.getByRole("button", { name: "Exclude Sol Ring from Binder" }));
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("button", { name: "Exclude Sol Ring from Binder" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("Add to new trade hands the row to the caller and leaves the exclude list alone", async () => {
    const onAddToTrade = vi.fn();
    render(<Harness collection={owned} onAddToTrade={onAddToTrade} />);
    await userEvent.click(screen.getByRole("button", { name: "Add to new trade: Rhystic Study" }));
    expect(onAddToTrade).toHaveBeenCalledWith(expect.objectContaining({ key: "rhystic study", surplus: 3 }));
    expect(JSON.parse(localStorage.getItem("mtg-checklist-binder-excluded-v1") ?? "[]")).toEqual([]);
  });

  it("empty collection asks for an import", () => {
    render(<Harness collection={{}} />);
    expect(screen.getByText("Import a collection to see spare cards")).toBeInTheDocument();
  });

  it("everything committed shows the no-spare empty state", () => {
    render(<Harness collection={{ "sol ring": [{ quantity: 1 }] }} decks={[deck([["Sol Ring", 1]])]} />);
    expect(screen.getByText("No spare cards right now")).toBeInTheDocument();
  });

  it("everything excluded shows the kept-out empty state and a way back", async () => {
    localStorage.setItem("mtg-checklist-binder-excluded-v1", JSON.stringify(["sol ring"]));
    render(<Harness collection={{ "sol ring": [{ quantity: 2 }] }} />);
    expect(screen.getByText("Everything spare is kept out")).toBeInTheDocument();
    expect(screen.getByText(/1 card is hidden by Keep these/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show Keep these" }));
    await userEvent.click(screen.getByRole("button", { name: "Show in Binder: Sol Ring" }));
    expect(screen.getByRole("list", { name: "Spare cards" })).toBeInTheDocument();
  });

  it("phones get a row-actions sheet instead of inline buttons", async () => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    const onAddToTrade = vi.fn();
    render(<Harness collection={owned} onAddToTrade={onAddToTrade} />);
    expect(screen.queryByRole("button", { name: /^Exclude / })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Actions for Sol Ring" }));
    const sheet = screen.getByRole("dialog", { name: "Sol Ring" });
    expect(sheet).toHaveTextContent("4 owned · 4 spare");
    await userEvent.click(within(sheet).getByRole("button", { name: /Exclude from Binder/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Sol Ring kept out of Binder.");
  });
});
