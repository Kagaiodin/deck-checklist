import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../../App";
import { encodeTrade } from "../../../utils/tradeShare";
import { DEFAULT_SETTINGS, type Trade } from "../../../types/trade";

// App-level wiring: Trade is a page nested under Collection, reached from the ⋯ menu or a share link.

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
  window.location.hash = "";
});
afterEach(() => {
  window.location.hash = "";
  vi.unstubAllGlobals();
});

// Top-level tabs render a short and a full label, so match by prefix inside the header nav.
const tab = (name: RegExp) => within(document.querySelector<HTMLElement>(".app-nav")!).getByRole("button", { name });

const goToTrade = async () => {
  await userEvent.click(tab(/^Collection/));
  await userEvent.click(screen.getAllByRole("button", { name: "More options" }).find((b) => b.className.includes("collection-overflow-btn"))!);
  await userEvent.click(screen.getByRole("button", { name: /Trade calculator/ }));
};

const card = { id: "c", name: "Creator Card", scryfallId: "", set: "cmm", collectorNumber: "410", finish: "nonfoil" as const, condition: "NM" as const, quantity: 1, basePrice: 10, priceFetchedAt: 0, source: "search" as const };
const shared: Trade = { mine: { cards: [card], cash: [] }, theirs: { cards: [], cash: [] }, settings: { ...DEFAULT_SETTINGS }, readOnly: false };

describe("Trade route", () => {
  it("is not a top-level tab", () => {
    render(<App />);
    const nav = screen.getByRole("navigation");
    expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(["DecksDecks", "CollectionCollection", "Orders"]);
    expect(screen.queryByRole("heading", { name: "Trade" })).not.toBeInTheDocument();
  });

  it("opens from Collection's ⋯ menu with a Collection › Trade breadcrumb", async () => {
    render(<App />);
    await goToTrade();
    expect(screen.getByRole("heading", { level: 1, name: "Trade" })).toBeInTheDocument();
    const crumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumb).getByRole("button", { name: "Collection" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "My offer" })).toBeInTheDocument();
  });

  it("goes back to Collection from the breadcrumb", async () => {
    render(<App />);
    await goToTrade();
    await userEvent.click(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("button", { name: "Collection" }));
    expect(screen.queryByRole("heading", { name: "Trade" })).not.toBeInTheDocument();
    expect(screen.getByText("No cards yet")).toBeInTheDocument(); // Collection empty state
  });

  it("leaves Trade when a top-level tab is clicked", async () => {
    render(<App />);
    await goToTrade();
    await userEvent.click(tab(/^Orders/));
    expect(screen.queryByRole("heading", { name: "Trade" })).not.toBeInTheDocument();
  });

  it("offers cards from the current collection, read fresh from storage", async () => {
    store.set("mtg-checklist-collection-v2", JSON.stringify({ "sol ring": [{ quantity: 2, set: "cmm", collectorNumber: "410" }] }));
    store.set("mtg-checklist-collection-meta-v2", JSON.stringify({ fileName: "x.csv", importedAt: 0, cardCount: 1 }));
    render(<App />);
    await goToTrade();
    await userEvent.click(within(screen.getByRole("region", { name: "My offer" })).getByRole("button", { name: /From collection/ }));
    expect(await screen.findByRole("button", { name: "Add Sol Ring" })).toBeInTheDocument();
  });

  it("opens straight into a shared trade when the page loads with a share link", async () => {
    window.location.hash = `#trade=${await encodeTrade(shared, Date.now())}`;
    render(<App />);
    expect(await screen.findByText(/Shared trade — prices as of/)).toBeInTheDocument();
    // Perspective flips: the creator's "mine" is the opener's "theirs".
    expect(within(screen.getByRole("region", { name: "Their offer" })).getByText("Creator Card")).toBeInTheDocument();
  });

  it("opens a share link pasted into an already-open tab", async () => {
    render(<App />);
    expect(screen.queryByRole("heading", { name: "Trade" })).not.toBeInTheDocument();
    const hash = `#trade=${await encodeTrade(shared, Date.now())}`;
    await act(async () => {
      window.location.hash = hash;
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(await screen.findByText(/Shared trade — prices as of/)).toBeInTheDocument();
  });

  it("drops the share link from the URL when leaving the shared trade", async () => {
    window.location.hash = `#trade=${await encodeTrade(shared, Date.now())}`;
    render(<App />);
    await screen.findByText(/Shared trade — prices as of/);
    await userEvent.click(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("button", { name: "Collection" }));
    await waitFor(() => expect(window.location.hash).toBe(""));
  });
});
