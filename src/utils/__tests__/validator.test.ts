import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pickCardColors, validateDecklist } from "../validator";

// ── pickCardColors ────────────────────────────────────────────────────────────
//
// This is the core logic that decides which Scryfall color field to store on a
// Card. The rules are:
//   - Dual-face cards  → front face colors (falls back to color_identity)
//   - Land cards       → color_identity  (so shock/fetch lands get the right colors)
//   - Everything else  → colors          (falls back to color_identity)

describe("pickCardColors", () => {
  // ── Non-land spells ─────────────────────────────────────────────────────────

  it("returns colors for a non-land card", () => {
    expect(pickCardColors("Instant", ["R"], ["R"], false, undefined)).toEqual(["R"]);
  });

  it("falls back to color_identity when colors is undefined on a non-land", () => {
    expect(pickCardColors("Creature — Human", undefined, ["W", "B"], false, undefined)).toEqual(["W", "B"]);
  });

  it("returns empty array for a colorless artifact", () => {
    expect(pickCardColors("Artifact", [], [], false, undefined)).toEqual([]);
  });

  // ── Land cards ──────────────────────────────────────────────────────────────

  it("uses color_identity for a basic land (colors is [])", () => {
    // Plains: colors=[], color_identity=["W"]
    expect(pickCardColors("Basic Land — Plains", [], ["W"], false, undefined)).toEqual(["W"]);
  });

  it("uses color_identity for a shock land", () => {
    // Godless Shrine: colors=[], color_identity=["W","B"]
    expect(pickCardColors("Land — Plains Swamp", [], ["W", "B"], false, undefined)).toEqual(["W", "B"]);
  });

  it("uses color_identity for a fetch land", () => {
    // Scalding Tarn: colors=[], color_identity=["U","R"]
    expect(pickCardColors("Land", [], ["U", "R"], false, undefined)).toEqual(["U", "R"]);
  });

  it("returns empty array for a truly colorless land (e.g. Wastes)", () => {
    // Wastes: colors=[], color_identity=[]
    expect(pickCardColors("Basic Land", [], [], false, undefined)).toEqual([]);
  });

  it("returns empty array for Field of the Dead (colorless utility land)", () => {
    expect(pickCardColors("Land", [], [], false, undefined)).toEqual([]);
  });

  // ── Dual-face cards ─────────────────────────────────────────────────────────

  it("uses front face colors for a dual-face spell // land", () => {
    // Bala Ged Recovery // Bala Ged Sanctuary
    // Front: Sorcery, colors=["G"]; back: Land
    expect(pickCardColors("Sorcery\nLand", undefined, ["G"], true, ["G"])).toEqual(["G"]);
  });

  it("falls back to color_identity when front face colors is undefined on a dual-face", () => {
    expect(pickCardColors("Creature", undefined, ["U", "R"], true, undefined)).toEqual(["U", "R"]);
  });

  it("dual-face takes front-face colors even when type_line contains 'Land'", () => {
    // If somehow both dual and land: dual flag wins, uses front face
    expect(pickCardColors("Land", undefined, ["W"], true, ["W", "B"])).toEqual(["W", "B"]);
  });

  // ── Type line matching ───────────────────────────────────────────────────────

  it("treats 'Snow Land' as a land", () => {
    expect(pickCardColors("Snow Land — Forest", [], ["G"], false, undefined)).toEqual(["G"]);
  });

  it("treats 'Artifact Land' as a land", () => {
    // Darksteel Citadel: colors=[], color_identity=[]
    expect(pickCardColors("Artifact Land", [], [], false, undefined)).toEqual([]);
  });
});

// ── validateDecklist ──────────────────────────────────────────────────────────
//
// All Scryfall HTTP calls are stubbed via vi.stubGlobal so no network traffic.
// POST to /cards/collection = batch lookup
// GET  to /cards/named      = fuzzy fallback

type ScryfallCardFace = { name: string; colors?: string[]; type_line?: string };
type ScryfallCard = {
  id: string;
  name: string;
  colors?: string[];
  color_identity: string[];
  type_line: string;
  card_faces?: ScryfallCardFace[];
  set: string;
  rarity: "common" | "uncommon" | "rare" | "mythic" | "special" | "bonus";
};
type BatchResponse = { data: ScryfallCard[]; not_found: { name: string }[] };

function makeScryCard(
  overrides: Partial<ScryfallCard> & { id: string; name: string }
): ScryfallCard {
  return {
    colors: [],
    color_identity: [],
    type_line: "Instant",
    set: "ktk",
    rarity: "common",
    ...overrides,
  };
}

function mockFetch(batchResponse: BatchResponse, fuzzyCard?: ScryfallCard | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      if (opts?.method === "POST") {
        return { ok: true, json: async () => batchResponse };
      }
      // GET /cards/named fuzzy lookup
      if (fuzzyCard == null) {
        return { ok: false, json: async () => ({ object: "error" }) };
      }
      return { ok: true, json: async () => fuzzyCard };
    })
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("validateDecklist", () => {

  // ── Happy path ───────────────────────────────────────────────────────────────

  it("returns a Card for each found card", async () => {
    const sc = makeScryCard({ id: "abc", name: "Lightning Bolt", colors: ["R"] });
    mockFetch({ data: [sc], not_found: [] });

    const { cards, errors } = await validateDecklist([{ count: 4, name: "Lightning Bolt" }]);

    expect(errors).toHaveLength(0);
    expect(cards).toHaveLength(1);
    expect(cards[0].name).toBe("Lightning Bolt");
    expect(cards[0].quantity).toBe(4);
    expect(cards[0].id).toBe("abc");
    expect(cards[0].acquired).toBe(false);
  });

  it("uppercases the set code", async () => {
    const sc = makeScryCard({ id: "x1", name: "Sol Ring", set: "ltr" });
    mockFetch({ data: [sc], not_found: [] });

    const { cards } = await validateDecklist([{ count: 1, name: "Sol Ring" }]);
    expect(cards[0].set).toBe("LTR");
  });

  it("preserves rarity from Scryfall", async () => {
    const sc = makeScryCard({ id: "x1", name: "Rhystic Study", set: "pcy", rarity: "uncommon" });
    mockFetch({ data: [sc], not_found: [] });

    const { cards } = await validateDecklist([{ count: 1, name: "Rhystic Study" }]);
    expect(cards[0].rarity).toBe("uncommon");
  });

  it("strips the subtype dash from the type_line", async () => {
    const sc = makeScryCard({ id: "x1", name: "Tarmogoyf", type_line: "Creature — Lhurgoyf" });
    mockFetch({ data: [sc], not_found: [] });

    const { cards } = await validateDecklist([{ count: 1, name: "Tarmogoyf" }]);
    expect(cards[0].type).toBe("Creature");
  });

  it("stores colors for a colored spell", async () => {
    const sc = makeScryCard({
      id: "x1", name: "Counterspell",
      colors: ["U"], color_identity: ["U"], type_line: "Instant",
    });
    mockFetch({ data: [sc], not_found: [] });

    const { cards } = await validateDecklist([{ count: 2, name: "Counterspell" }]);
    expect(cards[0].color).toEqual(["U"]);
  });

  it("uses color_identity for lands (shock land example)", async () => {
    const sc = makeScryCard({
      id: "x1", name: "Godless Shrine",
      colors: [], color_identity: ["W", "B"],
      type_line: "Land — Plains Swamp",
    });
    mockFetch({ data: [sc], not_found: [] });

    const { cards } = await validateDecklist([{ count: 1, name: "Godless Shrine" }]);
    expect(cards[0].color).toEqual(["W", "B"]);
  });

  it("returns all found cards in one batch", async () => {
    const scCards = [
      makeScryCard({ id: "a", name: "Lightning Bolt", colors: ["R"] }),
      makeScryCard({ id: "b", name: "Counterspell",   colors: ["U"] }),
    ];
    mockFetch({ data: scCards, not_found: [] });

    const { cards, errors } = await validateDecklist([
      { count: 4, name: "Lightning Bolt" },
      { count: 4, name: "Counterspell"   },
    ]);

    expect(cards).toHaveLength(2);
    expect(errors).toHaveLength(0);
  });

  // ── Deduplication ────────────────────────────────────────────────────────────

  it("deduplicates the same card name and sums quantities", async () => {
    const sc = makeScryCard({ id: "x1", name: "Lightning Bolt", colors: ["R"] });
    mockFetch({ data: [sc], not_found: [] });

    const { cards } = await validateDecklist([
      { count: 2, name: "Lightning Bolt" },
      { count: 2, name: "Lightning Bolt" },
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0].quantity).toBe(4);
    // Only one batch request issued
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
  });

  it("is case-insensitive when deduplicating names", async () => {
    const sc = makeScryCard({ id: "x1", name: "Lightning Bolt", colors: ["R"] });
    mockFetch({ data: [sc], not_found: [] });

    const { cards } = await validateDecklist([
      { count: 1, name: "lightning bolt" },
      { count: 3, name: "Lightning Bolt" },
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0].quantity).toBe(4);
  });

  // ── not_found fuzzy fallback ──────────────────────────────────────────────────

  it("resolves not_found cards via fuzzy lookup and sets inputName", async () => {
    const fuzzy = makeScryCard({ id: "fz1", name: "Lightning Bolt", colors: ["R"] });
    mockFetch({ data: [], not_found: [{ name: "Lightnin Bolt" }] }, fuzzy);

    const { cards, errors } = await validateDecklist([{ count: 1, name: "Lightnin Bolt" }]);

    expect(errors).toHaveLength(0);
    expect(cards).toHaveLength(1);
    expect(cards[0].name).toBe("Lightning Bolt");
    expect(cards[0].inputName).toBe("Lightnin Bolt");
  });

  it("adds an ErrorQueueItem when fuzzy lookup also fails", async () => {
    mockFetch({ data: [], not_found: [{ name: "Xyzzy Card" }] }, null);

    const { cards, errors } = await validateDecklist([{ count: 1, name: "Xyzzy Card" }]);

    expect(cards).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].originalName).toBe("Xyzzy Card");
    expect(errors[0].searchName).toBe("Xyzzy Card");
    expect(errors[0].resolved).toBe(false);
  });

  it("handles a mix of found, fuzzy-resolved, and unresolvable cards", async () => {
    const fuzzy = makeScryCard({ id: "fz1", name: "Counterspell", colors: ["U"] });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, opts?: RequestInit) => {
        if (opts?.method === "POST") {
          return {
            ok: true,
            json: async () => ({
              data:      [makeScryCard({ id: "a", name: "Lightning Bolt", colors: ["R"] })],
              not_found: [{ name: "Countersspell" }, { name: "Fake Card XYZ" }],
            }),
          };
        }
        // fuzzy: succeed for first call, fail for second
        const callCount = vi.mocked(global.fetch).mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method !== "POST").length;
        if (callCount <= 1) return { ok: true, json: async () => fuzzy };
        return { ok: false, json: async () => ({ object: "error" }) };
      })
    );

    const { cards, errors } = await validateDecklist([
      { count: 4, name: "Lightning Bolt"   },
      { count: 2, name: "Countersspell"    },
      { count: 1, name: "Fake Card XYZ"    },
    ]);

    expect(cards).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0].originalName).toBe("Fake Card XYZ");
  });

  // ── Progress callback ─────────────────────────────────────────────────────────

  it("calls onProgress with running total and validated count", async () => {
    const sc = makeScryCard({ id: "x1", name: "Sol Ring" });
    mockFetch({ data: [sc], not_found: [] });

    const snapshots: { total: number; validated: number }[] = [];
    await validateDecklist([{ count: 1, name: "Sol Ring" }], p => snapshots.push({ ...p }));

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].total).toBe(1);
    expect(snapshots[0].validated).toBe(1);
  });

  // ── Dual-faced cards ──────────────────────────────────────────────────────────

  it("uses the front face name and colors for a DFC", async () => {
    const sc: ScryfallCard = {
      id: "dfc1",
      name: "Delver of Secrets // Insectile Aberration",
      type_line: "Creature — Human Wizard // Creature — Human Insect",
      colors: undefined,
      color_identity: ["U"],
      set: "isd",
      rarity: "common",
      card_faces: [
        { name: "Delver of Secrets",      colors: ["U"], type_line: "Creature — Human Wizard"  },
        { name: "Insectile Aberration",   colors: ["U"], type_line: "Creature — Human Insect" },
      ],
    };
    mockFetch({ data: [sc], not_found: [] });

    const { cards } = await validateDecklist([{ count: 1, name: "Delver of Secrets" }]);

    expect(cards[0].name).toBe("Delver of Secrets");
    expect(cards[0].color).toEqual(["U"]);
    expect(cards[0].type).toBe("Creature");
  });

  it("uses front face colors for a spell // land DFC (not color_identity)", async () => {
    const sc: ScryfallCard = {
      id: "dfc2",
      name: "Bala Ged Recovery // Bala Ged Sanctuary",
      type_line: "Sorcery // Land",
      colors: undefined,
      color_identity: ["G"],
      set: "znr",
      rarity: "uncommon",
      card_faces: [
        { name: "Bala Ged Recovery",  colors: ["G"], type_line: "Sorcery" },
        { name: "Bala Ged Sanctuary", colors: [],    type_line: "Land"    },
      ],
    };
    mockFetch({ data: [sc], not_found: [] });

    const { cards } = await validateDecklist([{ count: 1, name: "Bala Ged Recovery" }]);

    expect(cards[0].name).toBe("Bala Ged Recovery");
    expect(cards[0].color).toEqual(["G"]);
    expect(cards[0].type).toBe("Sorcery");
  });

  // ── Error responses ───────────────────────────────────────────────────────────

  it("throws when Scryfall collection endpoint returns non-ok with details", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, opts?: RequestInit) => {
      if (opts?.method === "POST") {
        return { ok: false, status: 400, json: async () => ({ object: "error", details: "Service unavailable" }) };
      }
      return { ok: false };
    }));

    await expect(
      validateDecklist([{ count: 1, name: "Lightning Bolt" }])
    ).rejects.toThrow("Service unavailable");
  });

  it("falls back to a generic error message when Scryfall details is absent", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, opts?: RequestInit) => {
      if (opts?.method === "POST") {
        return { ok: false, status: 503, json: async () => ({}) };
      }
      return { ok: false };
    }));

    await expect(
      validateDecklist([{ count: 1, name: "Lightning Bolt" }])
    ).rejects.toThrow("Scryfall error 503");
  });

  // ── Edge cases ────────────────────────────────────────────────────────────────

  it("returns empty results without calling fetch for an empty input list", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const { cards, errors } = await validateDecklist([]);
    expect(cards).toHaveLength(0);
    expect(errors).toHaveLength(0);
    expect(vi.mocked(global.fetch)).not.toHaveBeenCalled();
  });
});
