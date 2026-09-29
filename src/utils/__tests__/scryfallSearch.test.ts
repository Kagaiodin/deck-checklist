import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Finish } from "../../types/trade";
import { autocomplete, searchPrintings, fetchPrices, toPrinting, priceKey } from "../scryfallSearch";

const raw = (over = {}) => ({
  id: "id1", name: "Sol Ring", set: "cmd", set_name: "Commander", collector_number: "1",
  finishes: ["nonfoil", "foil"] as Finish[], prices: { usd: "1.00", usd_foil: "2.00" },
  image_uris: { small: "small.jpg" }, ...over,
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const fail = (status: number) => ({ ok: false, status, json: async () => ({}) }) as Response;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("toPrinting", () => {
  it("maps fields and uses the small image", () => {
    expect(toPrinting(raw())).toMatchObject({
      scryfallId: "id1", set: "cmd", setName: "Commander", collectorNumber: "1",
      finishes: ["nonfoil", "foil"], imageUrl: "small.jpg",
    });
  });
  it("falls back to the front face image and default finish/prices", () => {
    const p = toPrinting(raw({ image_uris: undefined, card_faces: [{ image_uris: { normal: "face.jpg" } }], finishes: undefined, prices: undefined }));
    expect(p.imageUrl).toBe("face.jpg");
    expect(p.finishes).toEqual(["nonfoil"]);
    expect(p.prices).toEqual({});
  });
});

describe("autocomplete", () => {
  it("skips the request for input under 2 characters", async () => {
    expect(await autocomplete(" a ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("returns suggestions", async () => {
    fetchMock.mockResolvedValue(ok({ data: ["Sol Ring", "Sol Talisman"] }));
    expect(await autocomplete("sol")).toEqual(["Sol Ring", "Sol Talisman"]);
    expect(fetchMock.mock.calls[0][0]).toContain("/cards/autocomplete?q=sol");
  });
  it("returns [] on a non-ok response", async () => {
    fetchMock.mockResolvedValue(fail(500));
    expect(await autocomplete("sol")).toEqual([]);
  });
});

describe("searchPrintings", () => {
  it("queries exact name with unique=prints", async () => {
    fetchMock.mockResolvedValue(ok({ data: [raw()] }));
    const res = await searchPrintings('Sol "Ring"');
    expect(res).toHaveLength(1);
    const url = decodeURIComponent(fetchMock.mock.calls[0][0] as string);
    expect(url).toContain('!"Sol Ring"');
    expect(url).toContain("unique=prints");
  });
  it("returns [] on 404 (no match)", async () => {
    fetchMock.mockResolvedValue(fail(404));
    expect(await searchPrintings("Nope")).toEqual([]);
  });
  it("throws on other errors", async () => {
    fetchMock.mockResolvedValue(fail(500));
    await expect(searchPrintings("Sol Ring")).rejects.toThrow("Scryfall error 500");
  });
});

describe("fetchPrices", () => {
  it("looks up by id when known, else set + collector number, and keys results both ways", async () => {
    fetchMock.mockResolvedValue(ok({ data: [raw()] }));
    const map = await fetchPrices([
      { scryfallId: "id1", set: "cmd", collectorNumber: "1" },
      { set: "MH3", collectorNumber: "5" },
    ]);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.identifiers).toEqual([{ id: "id1" }, { set: "mh3", collector_number: "5" }]);
    expect(map.get("id1")?.name).toBe("Sol Ring");
    expect(map.get("cmd:1")?.name).toBe("Sol Ring");
    expect(priceKey({ set: "CMD", collectorNumber: "1" })).toBe("cmd:1");
  });
  it("batches at 75 and tolerates a failed batch", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(fail(500)).mockResolvedValueOnce(ok({ data: [raw()] }));
    const lookups = Array.from({ length: 80 }, (_, i) => ({ scryfallId: `x${i}`, set: "cmd", collectorNumber: String(i) }));
    const p = fetchPrices(lookups);
    await vi.runAllTimersAsync();
    const map = await p;
    vi.useRealTimers();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).identifiers).toHaveLength(75);
    expect(map.size).toBe(2); // only the second batch landed
  });
  it("survives a network error", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    expect((await fetchPrices([{ set: "cmd", collectorNumber: "1" }])).size).toBe(0);
  });
});
