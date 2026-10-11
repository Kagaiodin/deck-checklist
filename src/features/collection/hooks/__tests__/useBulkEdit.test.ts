import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBulkEdit } from "../useBulkEdit";
import type { Collection } from "../../../../types/index";

const collection: Collection = {
  "lightning bolt": [{ quantity: 2 }],
  "sol ring": [{ quantity: 1, foil: true }],
};

function setup(meta: Parameters<typeof useBulkEdit>[0]["collectionMeta"] = null) {
  const onApply = vi.fn();
  const hook = renderHook(() => useBulkEdit({ collection, collectionMeta: meta, onApply }));
  return { ...hook, onApply };
}

describe("useBulkEdit", () => {
  it("has no preview for empty or unparseable text", () => {
    const { result } = setup();
    expect(result.current.bulkPreview).toBeNull();
    act(() => result.current.setBulkEditText("   "));
    expect(result.current.bulkPreview).toBeNull();
  });

  it("previews added and updated counts in merge mode", () => {
    const { result } = setup();
    act(() => result.current.setBulkEditText("4 Lightning Bolt\n1 Counterspell"));
    expect(result.current.bulkPreview).toEqual({ added: 1, updated: 1, removed: 0 });
  });

  it("previews removals in replace mode", () => {
    const { result } = setup();
    act(() => result.current.setBulkEditMode("replace"));
    act(() => result.current.setBulkEditText("1 Counterspell"));
    expect(result.current.bulkPreview).toEqual({ added: 1, updated: 0, removed: 2 });
  });

  it("sets an error and does not apply when no valid lines", () => {
    const { result, onApply } = setup();
    act(() => result.current.setBulkEditText("not a card line !!!"));
    act(() => result.current.handleBulkEdit());
    expect(result.current.bulkEditError).toMatch(/No valid card lines/);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("merges into the existing collection and closes the panel", () => {
    const { result, onApply } = setup({ fileName: "mine.csv", importedAt: 5, cardCount: 2 });
    act(() => result.current.setBulkEditOpen(true));
    act(() => result.current.setBulkEditText("4 Lightning Bolt\n1 Counterspell"));
    act(() => result.current.handleBulkEdit());

    const [next, meta, mode] = onApply.mock.calls[0];
    expect(mode).toBe("merge");
    expect(next["lightning bolt"]).toEqual([{ quantity: 4 }]);
    expect(next["counterspell"]).toEqual([{ quantity: 1 }]);
    expect(next["sol ring"]).toEqual([{ quantity: 1, foil: true }]);
    expect(meta).toEqual({ fileName: "mine.csv", importedAt: 5, cardCount: 3 });
    expect(result.current.bulkEditOpen).toBe(false);
    expect(result.current.bulkEditText).toBe("");
  });

  it("replace mode drops cards not in the list and defaults meta", () => {
    const { result, onApply } = setup();
    act(() => result.current.setBulkEditMode("replace"));
    act(() => result.current.setBulkEditText("1 Counterspell"));
    act(() => result.current.handleBulkEdit());

    const [next, meta] = onApply.mock.calls[0];
    expect(Object.keys(next)).toEqual(["counterspell"]);
    expect(meta.fileName).toBe("Manual edit");
    expect(meta.cardCount).toBe(1);
  });

  it("a count of 0 removes the card in merge mode", () => {
    const { result, onApply } = setup();
    act(() => result.current.setBulkEditText("0 Lightning Bolt"));
    act(() => result.current.handleBulkEdit());
    expect(onApply.mock.calls[0][0]["lightning bolt"]).toBeUndefined();
  });

  it("tracks clearConfirming state", () => {
    const { result } = setup();
    act(() => result.current.setClearConfirming(true));
    expect(result.current.clearConfirming).toBe(true);
  });
});
