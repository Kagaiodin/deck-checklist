import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseJson, loadJson, saveJson } from "../savedJson";
import { MemoryStorage } from "../../features/demo/__tests__/memoryStorage";

// Stubbed like DeckProvider.test.tsx: jsdom's localStorage persists across a file's tests.
let storage: MemoryStorage;
beforeEach(() => { storage = new MemoryStorage(); vi.stubGlobal("localStorage", storage); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("parseJson", () => {
  it("parses saved JSON", () => {
    expect(parseJson('{"a":1}', {})).toEqual({ a: 1 });
  });

  it.each([
    ["nothing saved", null],
    ["empty text", ""],
    ["unreadable text", "{oops"],
    ["a saved null", "null"],
  ])("gives the fallback for %s", (_, raw) => {
    expect(parseJson(raw, ["fallback"])).toEqual(["fallback"]);
  });

  it("passes the parsed value to check and returns what it returns", () => {
    const check = vi.fn((v: unknown) => (v as number[]).filter(n => n > 1));
    expect(parseJson("[1,2,3]", [], check)).toEqual([2, 3]);
    expect(check).toHaveBeenCalledWith([1, 2, 3]);
  });

  it("gives the fallback when check throws", () => {
    expect(parseJson("[1]", "fallback", () => { throw new Error("bad shape"); })).toBe("fallback");
  });

  it("doesn't call check for a saved null", () => {
    const check = vi.fn();
    parseJson("null", 0, check);
    expect(check).not.toHaveBeenCalled();
  });
});

describe("loadJson / saveJson", () => {
  it("saves a value and loads it back", () => {
    saveJson("k", { a: [1] });
    expect(storage.getItem("k")).toBe('{"a":[1]}');
    expect(loadJson("k", {})).toEqual({ a: [1] });
  });

  it("loadJson gives the fallback when storage is blocked", () => {
    vi.spyOn(storage, "getItem").mockImplementation(() => { throw new DOMException("blocked", "SecurityError"); });
    expect(loadJson("k", "fallback")).toBe("fallback");
  });

  it("saveJson swallows a quota error", () => {
    storage.failOn.add("k");
    expect(() => saveJson("k", [1])).not.toThrow();
    expect(storage.getItem("k")).toBeNull();
  });
});
