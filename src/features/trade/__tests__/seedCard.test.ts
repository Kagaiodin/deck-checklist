import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../utils/scryfallSearch", () => ({
  fetchPrices: vi.fn(),
  searchPrintings: vi.fn(),
  priceKey: (c: { set: string; collectorNumber: string }) => `${c.set.toLowerCase()}:${c.collectorNumber}`,
}));
import { fetchPrices, searchPrintings } from "../../../utils/scryfallSearch";
import { seedToTradeCard } from "../seedCard";

const printing = {
  scryfallId: "abc", name: "Sol Ring", set: "cmm", collectorNumber: "1", imageUrl: "u",
  prices: { usd: "1.50", usd_foil: "4.00", usd_etched: null }, finishes: ["nonfoil", "foil"],
};

beforeEach(() => vi.resetAllMocks());

describe("seedToTradeCard", () => {
  it("prices the exact printing and keeps its foil finish", async () => {
    vi.mocked(fetchPrices).mockResolvedValue(new Map([["cmm:1", printing]]) as never);
    const card = await seedToTradeCard({ name: "sol ring", set: "cmm", collectorNumber: "1", foil: true });
    expect(card).toMatchObject({ name: "Sol Ring", set: "cmm", finish: "foil", quantity: 1, source: "collection", condition: "NM", basePrice: 4 });
  });

  it("prices a foil row on an etched-only printing as etched", async () => {
    const etched = { ...printing, prices: { usd: null, usd_foil: null, usd_etched: "7.00" }, finishes: ["etched"] };
    vi.mocked(fetchPrices).mockResolvedValue(new Map([["cmm:1", etched]]) as never);
    const card = await seedToTradeCard({ name: "sol ring", set: "cmm", collectorNumber: "1", foil: true });
    expect(card).toMatchObject({ finish: "etched", basePrice: 7 });
  });

  it("keeps foil when the printing is sold both foil and etched", async () => {
    vi.mocked(fetchPrices).mockResolvedValue(new Map([["cmm:1", { ...printing, finishes: ["foil", "etched"] }]]) as never);
    const card = await seedToTradeCard({ name: "sol ring", set: "cmm", collectorNumber: "1", foil: true });
    expect(card.finish).toBe("foil");
  });

  it("falls back to the newest printing when the row has no set", async () => {
    vi.mocked(searchPrintings).mockResolvedValue([printing] as never);
    const card = await seedToTradeCard({ name: "sol ring" });
    expect(card).toMatchObject({ set: "cmm", collectorNumber: "1", finish: "nonfoil", basePrice: 1.5 });
  });

  it("ignores a fuzzy search hit for a different card", async () => {
    vi.mocked(searchPrintings).mockResolvedValue([{ ...printing, name: "Emeritus of Woe // Demonic Tutor", set: "psos" }] as never);
    const card = await seedToTradeCard({ name: "demonic tutor" });
    expect(card).toMatchObject({ name: "Demonic Tutor", set: "", basePrice: null, scryfallId: "" });
  });

  it("accepts a double-faced card by its front face", async () => {
    vi.mocked(searchPrintings).mockResolvedValue([{ ...printing, name: "Delver of Secrets // Insectile Aberration" }] as never);
    const card = await seedToTradeCard({ name: "delver of secrets" });
    expect(card.name).toBe("Delver of Secrets // Insectile Aberration");
  });

  it("is unpriced, not failed, when Scryfall is unreachable", async () => {
    vi.mocked(searchPrintings).mockRejectedValue(new Error("offline"));
    const card = await seedToTradeCard({ name: "sol ring" });
    expect(card).toMatchObject({ name: "Sol Ring", basePrice: null, priceFetchedAt: null, scryfallId: "" });
  });
});
