import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePartnerCheck } from "../usePartnerCheck";
import { clearPartnerCache } from "../../utils/partnerCheck";
import type { Card } from "../../types/index";

const cardOf = (name: string): Card => ({ id: name, name, quantity: 1, acquired: false, color: [], type: "Creature" });
const scry = (name: string, keywords: string[]) => ({ name, keywords, oracle_text: "", type_line: "Legendary Creature" });
const respond = (a: unknown, b: unknown) => ({ ok: true, json: async () => ({ data: [a, b], not_found: [] }) });

describe("usePartnerCheck", () => {
  beforeEach(() => clearPartnerCache());
  afterEach(() => vi.unstubAllGlobals());

  it("flags an unrecognized pair", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(scry("A", []), scry("B", []))));
    const { result } = renderHook(() => usePartnerCheck([cardOf("A"), cardOf("B")]));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("does not flag a legal pair", async () => {
    const fetchMock = vi.fn(async () => respond(scry("A", ["Partner"]), scry("B", ["Partner"])));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => usePartnerCheck([cardOf("A"), cardOf("B")]));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(result.current).toBe(false);
  });

  it("does nothing for fewer than two commanders", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => usePartnerCheck([cardOf("A")]));
    expect(result.current).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails open on error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("x"); }));
    const { result } = renderHook(() => usePartnerCheck([cardOf("A"), cardOf("B")]));
    await Promise.resolve();
    expect(result.current).toBe(false);
  });

  it("hides the note when a commander is removed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(scry("A", []), scry("B", []))));
    const { result, rerender } = renderHook(({ cs }) => usePartnerCheck(cs), { initialProps: { cs: [cardOf("A"), cardOf("B")] } });
    await waitFor(() => expect(result.current).toBe(true));
    rerender({ cs: [cardOf("A")] });
    expect(result.current).toBe(false);
  });
});
