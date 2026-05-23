import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import "./CollectionPage.css";
import type { Card, Collection, CollectionMeta, CollectionPrinting, Deck } from "../../types/index";
import type { CollectionFilterKey, CommittedInfo, EditingPrinting } from "../../types/collection";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { parseCollectionCSV } from "../../utils/csvParser";

import { useCommittedInfo }    from "./hooks/useCommittedInfo";
import { useCollectionStats }  from "./hooks/useCollectionStats";
import { useCollectionSort }   from "./hooks/useCollectionSort";
import { useCollectionFilter } from "./hooks/useCollectionFilter";
import { useBulkEdit }         from "./hooks/useBulkEdit";

import { CollectionHeader }   from "./components/CollectionHeader";
import { CollectionControls } from "./components/CollectionControls";
import { AlphaRail }          from "./components/AlphaRail";
import { CollectionRow }      from "./components/CollectionRow";
import { BulkEditPanel }      from "./components/BulkEditPanel";

// ── Virtual-list row ─────────────────────────────────────────────────────────
// Defined at module scope so react-virtuoso gets a stable function reference.

interface CRowData {
  expandedKey:     string | null;
  editingPrinting: EditingPrinting | null;
  hasDeckContext:  boolean;
  rarityMap:       Record<string, Card["rarity"] | undefined>;
  toggleExpand:    (name: string) => void;
  onAddCopy:       (name: string) => void;
  onRemove:        (name: string) => void;
  onStartEdit:     (ep: EditingPrinting) => void;
  onCommitEdit:    () => void;
  onCancelEdit:    () => void;
  onEditField:     (ep: EditingPrinting) => void;
  getCommitted:    (name: string) => CommittedInfo;
}

function CollectionRowItem(
  _index: number,
  item: { name: string; printings: CollectionPrinting[]; total: number },
  data: CRowData,
) {
  const { name, printings, total } = item;
  return (
    <CollectionRow
      name={name}
      printings={printings}
      total={total}
      rarity={data.rarityMap[name]}
      isExpanded={data.expandedKey === name}
      committed={data.getCommitted(name)}
      hasDeckContext={data.hasDeckContext}
      editingPrinting={data.editingPrinting}
      onToggleExpand={data.toggleExpand}
      onAddCopy={data.onAddCopy}
      onRemove={data.onRemove}
      onStartEdit={data.onStartEdit}
      onEditField={data.onEditField}
      onCommitEdit={data.onCommitEdit}
      onCancelEdit={data.onCancelEdit}
    />
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

interface CollectionPageProps {
  decks: Deck[];
  onCollectionChange: (collection: Collection) => void;
}

// ── Page root ────────────────────────────────────────────────────────────────

export function CollectionPage({ decks, onCollectionChange }: CollectionPageProps) {
  // ── Persisted state ────────────────────────────────────────────────────────
  const [collection, setCollection] = useLocalStorage<Collection>(
    "mtg-checklist-collection-v2", {},
  );
  const [collectionMeta, setCollectionMeta] = useLocalStorage<CollectionMeta | null>(
    "mtg-checklist-collection-meta-v2", null,
  );

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [collectionError,   setCollectionError]   = useState<string | null>(null);
  const [collectionSearch,  setCollectionSearch]   = useState("");
  const [collectionFilter,  setCollectionFilter]   = useState<CollectionFilterKey>("all");
  const [sortOpen,          setSortOpen]           = useState(false);
  const [expandedKey,       setExpandedKey]        = useState<string | null>(null);
  const [firstVisibleIdx,   setFirstVisibleIdx]    = useState(0);
  const [pendingCsvFile,    setPendingCsvFile]     = useState<File | null>(null);
  const [editingPrinting,   setEditingPrinting]    = useState<EditingPrinting | null>(null);

  const csvInputRef      = useRef<HTMLInputElement>(null);
  const collectionListRef = useRef<VirtuosoHandle>(null);

  // ── Derived / hook values ──────────────────────────────────────────────────
  const getCommittedInfo = useCommittedInfo(decks);

  // Derive highest rarity per card name from loaded decks.
  // CollectionPrinting has no rarity field — deck cards do (from Scryfall).
  const RARITY_RANK: Record<string, number> = {
    common: 0, uncommon: 1, rare: 2, mythic: 3, special: 4, bonus: 4,
  };
  const rarityMap = useMemo(() => {
    const map: Record<string, Card["rarity"]> = {};
    for (const deck of decks) {
      for (const card of deck.cards) {
        if (!card.rarity) continue;
        const key = card.name.toLowerCase();
        const current = map[key];
        if (!current || RARITY_RANK[card.rarity] > RARITY_RANK[current]) {
          map[key] = card.rarity;
        }
      }
    }
    return map;
  }, [decks]); // eslint-disable-line react-hooks/exhaustive-deps

  const { totalCards, uniqueCards, foilTotal, inDecksCount } =
    useCollectionStats(collection, getCommittedInfo);

  const { collectionSort, setCollectionSort, collectionFiltered } =
    useCollectionSort(collection, collectionSearch);

  const deckCardNames = new Set(decks.flatMap(d => d.cards.map(c => c.name.toLowerCase())));

  const { collectionPillFiltered, pillCounts } = useCollectionFilter(
    collectionFiltered, collectionFilter, deckCardNames, getCommittedInfo,
  );

  const alphaSort = collectionSort === "name-asc" || collectionSort === "name-desc";
  const letterIndexMap = new Map<string, number>();
  if (alphaSort) {
    collectionPillFiltered.forEach(({ name }, idx) => {
      const letter = name[0]?.toUpperCase();
      if (letter && !letterIndexMap.has(letter)) letterIndexMap.set(letter, idx);
    });
  }
  const activeAlphaLetter =
    collectionPillFiltered[firstVisibleIdx]?.name[0]?.toUpperCase() ?? null;

  // ── Scroll to top on filter/search/sort change ─────────────────────────────
  useEffect(() => {
    collectionListRef.current?.scrollToIndex(0);
    setFirstVisibleIdx(0);
  }, [collectionFilter, collectionSearch, collectionSort]);

  // ── Collection mutators ────────────────────────────────────────────────────
  function applyCollection(updated: Collection, meta: CollectionMeta) {
    setCollection(updated);
    setCollectionMeta(meta);
    onCollectionChange(updated);
  }

  function importCollectionFile(file: File) {
    setCollectionError(null);
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const raw = (ev.target?.result as string) ?? "";
        const parsed = parseCollectionCSV(raw);
        const cardCount = Object.keys(parsed).length;
        applyCollection(parsed, { fileName: file.name, importedAt: Date.now(), cardCount });
      } catch (err) {
        setCollectionError(err instanceof Error ? err.message : "Failed to parse CSV.");
      }
      if (csvInputRef.current) csvInputRef.current.value = "";
    };
    reader.readAsText(file);
  }

  function handleCollectionUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!collectionMeta) { importCollectionFile(file); return; }
    setPendingCsvFile(file);
    e.target.value = "";
  }

  function handleClearCollection() {
    setCollection({});
    setCollectionMeta(null);
    setCollectionError(null);
    onCollectionChange({});
  }

  function mutateCollection(updated: Collection) {
    setCollection(updated);
    if (collectionMeta) {
      setCollectionMeta({ ...collectionMeta, cardCount: Object.keys(updated).length });
    }
    onCollectionChange(updated);
  }

  function handleIncrement(key: string) {
    const updated = { ...collection };
    const printings = Array.isArray(updated[key]) ? [...updated[key]] : [];
    const gi = printings.findIndex(p => !p.set && !p.collectorNumber && !p.foil);
    if (gi >= 0) {
      printings[gi] = { ...printings[gi], quantity: printings[gi].quantity + 1 };
    } else {
      printings.push({ quantity: 1 });
    }
    updated[key] = printings;
    mutateCollection(updated);
  }

  function handleDecrement(key: string) {
    const updated = { ...collection };
    const printings = Array.isArray(updated[key]) ? [...updated[key]] : [];
    const gi = printings.findIndex(p => !p.set && !p.collectorNumber && !p.foil);
    const ti = gi >= 0 ? gi : printings.length - 1;
    if (ti < 0) return;
    const next =
      printings[ti].quantity > 1
        ? printings.map((p, i) => i === ti ? { ...p, quantity: p.quantity - 1 } : p)
        : printings.filter((_, i) => i !== ti);
    if (next.length === 0) { delete updated[key]; } else { updated[key] = next; }
    mutateCollection(updated);
  }

  function handleRemove(key: string) {
    const updated = { ...collection };
    delete updated[key];
    mutateCollection(updated);
  }

  function handleUpdatePrinting(
    key: string, idx: number, qty: number,
    set: string, cn: string, foil: boolean,
  ) {
    const updated = { ...collection };
    const printings = Array.isArray(updated[key]) ? [...updated[key]] : [];
    if (qty <= 0) {
      const next = printings.filter((_, i) => i !== idx);
      if (next.length === 0) { delete updated[key]; } else { updated[key] = next; }
    } else {
      printings[idx] = {
        quantity: qty,
        set:             set.trim().toUpperCase() || undefined,
        collectorNumber: cn.trim()                || undefined,
        foil:            foil                     || undefined,
      };
      updated[key] = printings;
    }
    mutateCollection(updated);
  }

  function commitPrintingEdit() {
    if (!editingPrinting) return;
    const qty = parseInt(editingPrinting.qty, 10);
    handleUpdatePrinting(
      editingPrinting.key, editingPrinting.idx,
      isNaN(qty) ? 0 : qty,
      editingPrinting.set, editingPrinting.cn, editingPrinting.foil,
    );
    setEditingPrinting(null);
  }

  // ── Bulk edit ──────────────────────────────────────────────────────────────
  const {
    bulkEditOpen, setBulkEditOpen,
    bulkEditText, setBulkEditText,
    bulkEditMode, setBulkEditMode,
    bulkEditError,
    clearConfirming, setClearConfirming,
    bulkPreview,
    handleBulkEdit,
  } = useBulkEdit({
    collection,
    collectionMeta,
    onApply: applyCollection,
  });

  // ── Alpha rail ─────────────────────────────────────────────────────────────
  function jumpToLetter(letter: string) {
    const idx = letterIndexMap.get(letter);
    if (idx !== undefined) {
      collectionListRef.current?.scrollToIndex({ index: idx, behavior: "auto" });
    }
  }

  // ── Stable callbacks for react-virtuoso context ────────────────────────────
  const cbToggleExpand = useCallback(
    (name: string) => setExpandedKey(k => k === name ? null : name), [],
  );
  const cbAddCopy      = useCallback(handleIncrement,       [collection, collectionMeta]); // eslint-disable-line react-hooks/exhaustive-deps
  const cbRemove       = useCallback(handleRemove,          [collection, collectionMeta]); // eslint-disable-line react-hooks/exhaustive-deps
  const cbStartEdit    = useCallback((ep: EditingPrinting) => setEditingPrinting(ep), []);
  const cbCommitEdit   = useCallback(commitPrintingEdit,    [editingPrinting]);            // eslint-disable-line react-hooks/exhaustive-deps
  const cbCancelEdit   = useCallback(() => setEditingPrinting(null), []);
  const cbEditField    = useCallback((ep: EditingPrinting) => setEditingPrinting(ep), []);

  const listHeight = Math.min(600, Math.max(240, collectionPillFiltered.length * 56));

  const rowData: CRowData = {
    expandedKey:     expandedKey,
    editingPrinting: editingPrinting,
    hasDeckContext:  decks.length > 0,
    rarityMap,
    toggleExpand:    cbToggleExpand,
    onAddCopy:       cbAddCopy,
    onRemove:        cbRemove,
    onStartEdit:     cbStartEdit,
    onCommitEdit:    cbCommitEdit,
    onCancelEdit:    cbCancelEdit,
    onEditField:     cbEditField,
    getCommitted:    getCommittedInfo,
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <section className="collection-panel">
      {/* Hidden file input for CSV upload */}
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv"
        className="file-upload-input"
        onChange={handleCollectionUpload}
      />

      <CollectionHeader
        collectionMeta={collectionMeta}
        totalCards={totalCards}
        uniqueCards={uniqueCards}
        foilTotal={foilTotal}
        inDecksCount={inDecksCount}
        hasDeckContext={decks.length > 0}
        onUploadClick={() => csvInputRef.current?.click()}
        onBulkEditClick={() => setBulkEditOpen(v => !v)}
        bulkEditOpen={bulkEditOpen}
      />

      {collectionError && <p className="import-error">{collectionError}</p>}

      {/* CSV replace confirmation */}
      {pendingCsvFile && (
        <div className="collection-confirm-banner">
          <span>
            Replace{" "}
            <strong>{collectionMeta?.cardCount.toLocaleString()} cards</strong> with{" "}
            <strong>{pendingCsvFile.name}</strong>?
          </span>
          <div className="collection-confirm-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => { importCollectionFile(pendingCsvFile); setPendingCsvFile(null); }}
            >
              Replace
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setPendingCsvFile(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Bulk edit panel */}
      {bulkEditOpen && (
        <BulkEditPanel
          collection={collection}
          collectionMeta={collectionMeta}
          bulkEditMode={bulkEditMode}
          onModeChange={setBulkEditMode}
          bulkEditText={bulkEditText}
          onTextChange={setBulkEditText}
          bulkPreview={bulkPreview}
          bulkEditError={bulkEditError}
          clearConfirming={clearConfirming}
          onClearConfirmChange={setClearConfirming}
          onApply={handleBulkEdit}
          onClear={handleClearCollection}
          onClose={() => { setBulkEditOpen(false); setBulkEditText(""); }}
        />
      )}

      {/* Empty state */}
      {!collectionMeta && !collectionError && (
        <div className="collection-empty">
          <p>No collection uploaded yet.</p>
          <p className="collection-empty-hint">
            Export your collection from Moxfield (Account → Collection → Export) or any other
            supported app and upload the CSV above. Cards you own will be automatically tagged
            across all your decks.
          </p>
        </div>
      )}

      {/* Main list */}
      {collectionMeta && (
        <>
          <CollectionControls
            collectionSearch={collectionSearch}
            onSearchChange={setCollectionSearch}
            collectionSort={collectionSort}
            onSortChange={setCollectionSort}
            sortOpen={sortOpen}
            onSortOpenChange={setSortOpen}
            collectionFilter={collectionFilter}
            onFilterChange={setCollectionFilter}
            pillCounts={pillCounts}
            uniqueCards={uniqueCards}
          />

          <p className="collection-count-line">
            {collectionPillFiltered.length.toLocaleString()} card
            {collectionPillFiltered.length !== 1 ? "s" : ""}
            {collectionFilter !== "all" || collectionSearch
              ? ` · ${pillCounts.all.toLocaleString()} total`
              : ""}
          </p>

          {collectionPillFiltered.length === 0 &&
            (collectionSearch || collectionFilter !== "all") && (
              <p className="collection-empty-search">
                No cards
                {collectionSearch ? (
                  <> matching "<strong>{collectionSearch}</strong>"</>
                ) : ""}
                {collectionFilter !== "all" ? ` in "${collectionFilter}"` : ""}
              </p>
            )}

          <div className="collection-list-wrap">
            <Virtuoso
              ref={collectionListRef}
              style={{ height: listHeight }}
              data={collectionPillFiltered}
              context={rowData}
              itemContent={CollectionRowItem}
              rangeChanged={({ startIndex }) => setFirstVisibleIdx(startIndex)}
              className="collection-vlist"
              overscan={4}
            />

            {alphaSort && collectionPillFiltered.length > 10 && (
              <AlphaRail
                letterIndexMap={letterIndexMap}
                activeLetter={activeAlphaLetter}
                onJump={jumpToLetter}
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}
