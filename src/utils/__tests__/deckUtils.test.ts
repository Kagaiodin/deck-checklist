import { describe, it, expect } from "vitest";
import { getDeckColorIdentity, formatRelativeDate, getDeckDomain } from "../deckUtils";
import type { Deck } from "../../types/index";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDeck(cards: Array<{ color: string[] }>): Deck {
  return {
    id: "d1",
    name: "Test Deck",
    createdAt: Date.now(),
    cards: cards.map((c, i) => ({
      id: `c${i}`,
      name: `Card ${i}`,
      quantity: 1,
      acquired: false,
      type: "Instant",
      color: c.color,
    })),
  };
}

// ── getDeckColorIdentity ──────────────────────────────────────────────────────

describe("getDeckColorIdentity", () => {
  it("returns colors in WUBRG order regardless of card order", () => {
    const deck = makeDeck([{ color: ["R"] }, { color: ["W"] }, { color: ["U"] }]);
    expect(getDeckColorIdentity(deck)).toEqual(["W", "U", "R"]);
  });

  it("deduplicates colors that appear on multiple cards", () => {
    const deck = makeDeck([{ color: ["G"] }, { color: ["G"] }, { color: ["G"] }]);
    expect(getDeckColorIdentity(deck)).toEqual(["G"]);
  });

  it("returns all five colors for a five-color deck", () => {
    const deck = makeDeck([
      { color: ["W"] }, { color: ["U"] }, { color: ["B"] }, { color: ["R"] }, { color: ["G"] },
    ]);
    expect(getDeckColorIdentity(deck)).toEqual(["W", "U", "B", "R", "G"]);
  });

  it("handles multi-color cards", () => {
    const deck = makeDeck([{ color: ["W", "B"] }]);
    expect(getDeckColorIdentity(deck)).toEqual(["W", "B"]);
  });

  it("returns empty array for a colorless deck", () => {
    const deck = makeDeck([{ color: [] }, { color: [] }]);
    expect(getDeckColorIdentity(deck)).toEqual([]);
  });

  it("returns empty array for a deck with no cards", () => {
    expect(getDeckColorIdentity(makeDeck([]))).toEqual([]);
  });

  it("ignores color values that are not single WUBRG characters", () => {
    // Guard against unexpected data like multi-char strings or lowercase
    const deck = makeDeck([{ color: ["WU", "w", "X", "G"] }]);
    expect(getDeckColorIdentity(deck)).toEqual(["G"]);
  });
});

// ── formatRelativeDate ────────────────────────────────────────────────────────

describe("formatRelativeDate", () => {
  const DAY = 86_400_000;
  const now = new Date("2025-06-01T12:00:00Z").getTime();

  it("returns 'today' for a timestamp on the same day", () => {
    expect(formatRelativeDate(now - 1000, now)).toBe("today");
    expect(formatRelativeDate(now, now)).toBe("today");
  });

  it("returns 'yesterday' for exactly 1 day ago", () => {
    expect(formatRelativeDate(now - DAY, now)).toBe("yesterday");
  });

  it("returns 'Nd ago' for 2–6 days ago", () => {
    expect(formatRelativeDate(now - 2 * DAY, now)).toBe("2d ago");
    expect(formatRelativeDate(now - 6 * DAY, now)).toBe("6d ago");
  });

  it("returns 'Nw ago' for 7–29 days ago", () => {
    expect(formatRelativeDate(now - 7 * DAY, now)).toBe("1w ago");
    expect(formatRelativeDate(now - 14 * DAY, now)).toBe("2w ago");
    expect(formatRelativeDate(now - 29 * DAY, now)).toBe("4w ago");
  });

  it("returns 'Nmo ago' for 30+ days ago", () => {
    expect(formatRelativeDate(now - 30 * DAY, now)).toBe("1mo ago");
    expect(formatRelativeDate(now - 60 * DAY, now)).toBe("2mo ago");
    expect(formatRelativeDate(now - 365 * DAY, now)).toBe("12mo ago");
  });
});

// ── getDeckDomain ─────────────────────────────────────────────────────────────

describe("getDeckDomain", () => {
  it("extracts the hostname from a full https URL", () => {
    expect(getDeckDomain("https://www.archidekt.com/decks/123")).toBe("archidekt.com");
  });

  it("strips www. prefix", () => {
    expect(getDeckDomain("https://www.moxfield.com/decks/abc")).toBe("moxfield.com");
  });

  it("prepends https:// when the scheme is missing", () => {
    expect(getDeckDomain("archidekt.com/decks/123")).toBe("archidekt.com");
  });

  it("returns the raw string when the URL is unparseable", () => {
    expect(getDeckDomain("not a url !!!")).toBe("not a url !!!");
  });
});
