import { useState, useMemo } from "react";
import type { Collection, CollectionMeta } from "../../../types/index";
import type { BulkEditMode, BulkPreview } from "../../../types/collection";
import { parseDecklist } from "../../../utils/parser";

interface UseBulkEditOptions {
  collection: Collection;
  collectionMeta: CollectionMeta | null;
  onApply: (next: Collection, meta: CollectionMeta) => void;
}

interface UseBulkEditResult {
  bulkEditOpen: boolean;
  setBulkEditOpen: (open: boolean) => void;
  bulkEditText: string;
  setBulkEditText: (text: string) => void;
  bulkEditMode: BulkEditMode;
  setBulkEditMode: (mode: BulkEditMode) => void;
  bulkEditError: string | null;
  clearConfirming: boolean;
  setClearConfirming: (v: boolean) => void;
  bulkPreview: BulkPreview | null;
  handleBulkEdit: () => void;
}

/**
 * Owns all bulk-edit panel state: open/close, mode tabs, textarea text,
 * live preview computation, and apply logic.
 */
export function useBulkEdit({
  collection,
  collectionMeta,
  onApply,
}: UseBulkEditOptions): UseBulkEditResult {
  const [bulkEditOpen, setBulkEditOpen]   = useState(false);
  const [bulkEditText, setBulkEditText]   = useState("");
  const [bulkEditMode, setBulkEditMode]   = useState<BulkEditMode>("merge");
  const [bulkEditError, setBulkEditError] = useState<string | null>(null);
  const [clearConfirming, setClearConfirming] = useState(false);

  const bulkPreview = useMemo<BulkPreview | null>(() => {
    if (!bulkEditText.trim()) return null;
    try {
      const parsed = parseDecklist(bulkEditText);
      if (parsed.length === 0) return null;
      let added = 0;
      let updated = 0;
      for (const { name } of parsed) {
        const key = name.toLowerCase();
        if (collection[key]) updated++; else added++;
      }
      const removed = bulkEditMode === "replace"
        ? Object.keys(collection).filter(k => !parsed.some(p => p.name.toLowerCase() === k)).length
        : 0;
      return { added, updated, removed };
    } catch {
      return null;
    }
  }, [bulkEditText, bulkEditMode, collection]);

  function handleBulkEdit() {
    setBulkEditError(null);
    const parsed = parseDecklist(bulkEditText);
    if (parsed.length === 0) {
      setBulkEditError("No valid card lines found. Use the format: 4 Lightning Bolt");
      return;
    }
    const base: Collection = bulkEditMode === "replace" ? {} : { ...collection };
    for (const { count, name } of parsed) {
      const key = name.toLowerCase();
      if (count === 0) { delete base[key]; continue; }
      const existing = Array.isArray(base[key]) ? base[key] : [];
      const gi = existing.findIndex(p => !p.set && !p.collectorNumber && !p.foil);
      if (gi >= 0) {
        base[key] = existing.map((p, i) => i === gi ? { ...p, quantity: count } : p);
      } else {
        base[key] = [...existing, { quantity: count }];
      }
    }
    const cardCount = Object.keys(base).length;
    const meta: CollectionMeta = {
      fileName:   collectionMeta?.fileName   ?? "Manual edit",
      importedAt: collectionMeta?.importedAt ?? Date.now(),
      cardCount,
    };
    onApply(base, meta);
    setBulkEditText("");
    setBulkEditOpen(false);
  }

  return {
    bulkEditOpen,
    setBulkEditOpen,
    bulkEditText,
    setBulkEditText,
    bulkEditMode,
    setBulkEditMode,
    bulkEditError,
    clearConfirming,
    setClearConfirming,
    bulkPreview,
    handleBulkEdit,
  };
}
