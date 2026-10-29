import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Virtuoso, GroupedVirtuoso, type VirtuosoHandle, type GroupedVirtuosoHandle } from "react-virtuoso";
import "./CollectionPage.css";
import type { Card, Collection, CollectionMeta, CollectionPrinting, Deck } from "../../types/index";
import type { CollectionFilterKey, CollectionSortKey, CommittedInfo, EditingPrinting } from "../../types/collection";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { parseCollectionCSV } from "../../utils/csvParser";
import { groupCollectionBySet, type SetGroupRow } from "../../utils/collectionGroups";

import { useCommittedInfo }    from "./hooks/useCommittedInfo";
import { useCollectionStats }  from "./hooks/useCollectionStats";
import { useCollectionSort }   from "./hooks/useCollectionSort";
import { useCollectionFilter } from "./hooks/useCollectionFilter";
import { useBulkEdit }         from "./hooks/useBulkEdit";

import { CollectionHeader }        from "./components/CollectionHeader";
import { CollectionQuickAdd }       from "./components/CollectionQuickAdd";
import { CollectionFab }            from "./components/CollectionFab";
import { CollectionOverflowSheet }  from "./components/CollectionOverflowSheet";
import { AlphaRail }          from "./components/AlphaRail";
import { CollectionRow }      from "./components/CollectionRow";
import { EmptyState }         from "../../components/EmptyState";
import { BulkEditPanel }      from "./components/BulkEditPanel";

// ── Virtual-list row ─────────────────────────────────────────────────────────
// Defined at module scope so react-virtuoso gets a stable function reference.

interface CRowData {
  expandedKey:     string | null;
  editingPrinting: EditingPrinting | null;
  hasDeckContext:  boolean;
  rarityMap:       Record<string, Card["rarity"] | undefined>;
  toggleExpand:    (name: string) => void;
  onAddCopy:       (name: string, idx?: number) => void;
  onRemove:        (name: string, indices?: number[]) => void;
  onStartEdit:     (ep: EditingPrinting) => void;
  onCommitEdit:    () => void;
  onCancelEdit:    () => void;
  onEditField:     (ep: EditingPrinting) => void;
  getCommitted:    (name: string) => CommittedInfo;
  /** Full printings count per card, for new-printing indices in set mode. */
  fullCounts:      Record<string, number>;
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

/** Row inside a set group. Expands under its own id so a card repeated across groups opens once. */
function GroupedRowItem(
  _index: number,
  item: SetGroupRow & { set: string | null },
  data: CRowData,
) {
  const { name, printings, total, indices, set } = item;
  return (
    <CollectionRow
      name={name}
      printings={printings}
      total={total}
      rowKey={`${set ?? ""}|${name}`}
      indices={indices}
      fullCount={data.fullCounts[name]}
      groupSet={set}
      rarity={data.rarityMap[name]}
      isExpanded={data.expandedKey === `${set ?? ""}|${name}`}
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
  /** Opens the Trade calculator (its own route). Omit to hide the menu entry. */
  onOpenTrade?: () => void;
}

// ── Page root ────────────────────────────────────────────────────────────────

export function CollectionPage({ decks, onCollectionChange, onOpenTrade }: CollectionPageProps) {
  // ── Persisted state ────────────────────────────────────────────────────────
  const [collection, setCollection] = useLocalStorage<Collection>(
    "mtg-checklist-collection-v2", {},
  );
  const [collectionMeta, setCollectionMeta] = useLocalStorage<CollectionMeta | null>(
    "mtg-checklist-collection-meta-v2", null,
  );

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [quickAddOpen,        setQuickAddOpen]         = useState(false);
  const [collectionError,     setCollectionError]     = useState<string | null>(null);
  const [collectionSearch,    setCollectionSearch]     = useState("");
  const [collectionFilter,    setCollectionFilter]     = useState<CollectionFilterKey>("all");
  const [expandedKey,         setExpandedKey]          = useState<string | null>(null);
  const [overflowSheetOpen,   setOverflowSheetOpen]   = useState(false);
  const [firstVisibleIdx,   setFirstVisibleIdx]    = useState(0);
  const [pendingCsvFile,    setPendingCsvFile]     = useState<File | null>(null);
  const [editingPrinting,   setEditingPrinting]    = useState<EditingPrinting | null>(null);
  // Collapsed set codes ("" = the no-set group). Resets when the sort changes.
  const [collapsedSets,     setCollapsedSets]      = useState<Set<string>>(new Set());

  const csvInputRef       = useRef<HTMLInputElement>(null);
  const collectionListRef = useRef<VirtuosoHandle>(null);
  const groupedListRef    = useRef<GroupedVirtuosoHandle>(null);
  const snapshotRef       = useRef<{ collection: Collection; meta: CollectionMeta | null } | null>(null);
  const toastTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [undoToast, setUndoToast] = useState<string | null>(null);
  const [toastKey,  setToastKey]  = useState(0);

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

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

  const { totalCards, uniqueCards, deckCardTotal } =
    useCollectionStats(collection, getCommittedInfo);

  const { collectionSort, setCollectionSort: setSortKey, collectionFiltered } =
    useCollectionSort(collection, collectionSearch);

  function setCollectionSort(key: CollectionSortKey) {
    setSortKey(key);
    setCollapsedSets(new Set());
  }

  const deckCardNames = new Set(decks.flatMap(d => d.cards.map(c => c.name.toLowerCase())));

  const { collectionPillFiltered, pillCounts } = useCollectionFilter(
    collectionFiltered, collectionFilter, deckCardNames, getCommittedInfo,
  );

  // ── Group by set ───────────────────────────────────────────────────────────
  const setMode = collectionSort === "set";
  const searching = collectionSearch.trim() !== "";
  const setGroups = useMemo(
    () => setMode
      ? groupCollectionBySet(collectionPillFiltered, collectionFilter === "foils" ? p => !!p.foil : undefined)
      : [],
    [setMode, collectionPillFiltered, collectionFilter],
  );
  const isOpen = (set: string | null) => searching || !collapsedSets.has(set ?? "");
  const visibleRows = useMemo(
    () => setGroups.flatMap(g => (isOpen(g.set) ? g.rows.map(r => ({ ...r, set: g.set })) : [])),
    [setGroups, collapsedSets, searching], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const groupCounts = setGroups.map(g => (isOpen(g.set) ? g.rows.length : 0));
  const allCollapsed = setGroups.length > 0 && setGroups.every(g => collapsedSets.has(g.set ?? ""));
  const fullCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const { name, printings } of collectionFiltered) m[name] = printings.length;
    return m;
  }, [collectionFiltered]);

  function toggleGroup(set: string | null) {
    setCollapsedSets(prev => {
      const next = new Set(prev);
      const k = set ?? "";
      if (!next.delete(k)) next.add(k);
      return next;
    });
  }
  function toggleAllGroups() {
    setCollapsedSets(allCollapsed ? new Set() : new Set(setGroups.map(g => g.set ?? "")));
  }

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
    groupedListRef.current?.scrollToIndex(0);
    setFirstVisibleIdx(0);
  }, [collectionFilter, collectionSearch, collectionSort]);

  // ── Undo toast ─────────────────────────────────────────────────────────────
  function showUndoToast(message: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    snapshotRef.current = { collection, meta: collectionMeta };
    setUndoToast(message);
    setToastKey(k => k + 1);
    toastTimerRef.current = setTimeout(() => setUndoToast(null), 30_000);
  }

  function handleUndo() {
    if (!snapshotRef.current) return;
    setCollection(snapshotRef.current.collection);
    setCollectionMeta(snapshotRef.current.meta);
    onCollectionChange(snapshotRef.current.collection);
    snapshotRef.current = null;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setUndoToast(null);
  }

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
    showUndoToast("Collection cleared.");
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

  function handleIncrement(key: string, idx?: number) {
    const updated = { ...collection };
    const printings = Array.isArray(updated[key]) ? [...updated[key]] : [];
    // Set mode passes the shown printing; otherwise bump the generic one.
    const gi = idx !== undefined && printings[idx]
      ? idx
      : printings.findIndex(p => !p.set && !p.collectorNumber && !p.foil);
    if (gi >= 0) {
      printings[gi] = { ...printings[gi], quantity: printings[gi].quantity + 1 };
    } else {
      printings.push({ quantity: 1 });
    }
    updated[key] = printings;
    mutateCollection(updated);
  }

  function handleQuickAdd(name: string, qty: number, foil: boolean) {
    const key = name.toLowerCase();
    const updated = { ...collection };
    const printings = Array.isArray(updated[key]) ? [...updated[key]] : [];
    const match = printings.findIndex(
      p => !p.set && !p.collectorNumber && (p.foil ?? false) === foil
    );
    if (match >= 0) {
      printings[match] = { ...printings[match], quantity: printings[match].quantity + qty };
    } else {
      printings.push({ quantity: qty, foil: foil || undefined });
    }
    updated[key] = printings;
    if (!collectionMeta) {
      setCollectionMeta({
        fileName: "Manual entries",
        importedAt: Date.now(),
        cardCount: Object.keys(updated).length,
      });
    }
    mutateCollection(updated);
  }

  function handleRemove(key: string, indices?: number[]) {
    const updated = { ...collection };
    const remaining = indices && Array.isArray(updated[key])
      ? updated[key].filter((_, i) => !indices.includes(i))
      : [];
    if (remaining.length > 0) { updated[key] = remaining; } else { delete updated[key]; }
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
    onApply: (next, meta, mode) => {
      if (mode === "replace") showUndoToast("Collection replaced.");
      applyCollection(next, meta);
    },
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
    fullCounts,
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

      <div className="collection-container">
        <CollectionHeader
          collectionMeta={collectionMeta}
          totalCards={totalCards}
          uniqueCards={uniqueCards}
          deckCardTotal={deckCardTotal}
          hasDeckContext={decks.length > 0}
          filteredCount={collectionPillFiltered.length}
          onUploadClick={() => csvInputRef.current?.click()}
          onQuickAddClick={() => setQuickAddOpen(v => !v)}
          onBulkEditClick={() => setBulkEditOpen(!bulkEditOpen)}
          onOverflowOpen={() => setOverflowSheetOpen(true)}
          onOpenTrade={onOpenTrade}
          collectionSearch={collectionSearch}
          onSearchChange={setCollectionSearch}
          collectionFilter={collectionFilter}
          onFilterChange={setCollectionFilter}
          pillCounts={pillCounts}
          collectionSort={collectionSort}
          onSortChange={setCollectionSort}
          groupToggle={setMode && !searching && setGroups.length > 0
            ? { allCollapsed, onToggle: toggleAllGroups }
            : undefined}
        />

        {quickAddOpen && (
          <CollectionQuickAdd
            onAdd={handleQuickAdd}
            onCancel={() => setQuickAddOpen(false)}
          />
        )}

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
          <div className="collection-empty-wrap">
            <EmptyState
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="6" width="13" height="15" rx="2"/>
                  <rect x="8" y="3" width="13" height="15" rx="2"/>
                </svg>
              }
              title="No cards yet"
              body="Import your collection from Moxfield or add cards manually."
              primary={{ label: "Upload CSV", onClick: () => csvInputRef.current?.click() }}
              secondary={{ label: "+ Add card", onClick: () => setQuickAddOpen(true) }}
            />
          </div>
        )}

        {/* Main list */}
        {collectionMeta && (
          <>
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
              {setMode ? (
                <GroupedVirtuoso
                  ref={groupedListRef}
                  style={{ height: "100%" }}
                  groupCounts={groupCounts}
                  context={rowData}
                  groupContent={gi => {
                    const g = setGroups[gi];
                    const open = isOpen(g.set);
                    return (
                      <button
                        className={`collection-set-header${g.set === null ? " collection-set-header--unknown" : ""}`}
                        aria-expanded={open}
                        onClick={() => toggleGroup(g.set)}
                      >
                        <svg className="collection-set-chevron" viewBox="0 0 14 14" width="14" height="14" aria-hidden>
                          <path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="collection-set-code">{g.set ?? "Unknown set"}</span>
                        <span className="collection-set-counts">
                          <strong>{g.cards.toLocaleString()}</strong> {g.cards === 1 ? "card" : "cards"} ({g.copies.toLocaleString()} {g.copies === 1 ? "copy" : "copies"})
                        </span>
                      </button>
                    );
                  }}
                  itemContent={(index, _gi, _d, ctx) => GroupedRowItem(index, visibleRows[index], ctx as CRowData)}
                  className="collection-vlist"
                  overscan={4}
                />
              ) : (
              <Virtuoso
                ref={collectionListRef}
                style={{ height: "100%" }}
                data={collectionPillFiltered}
                context={rowData}
                itemContent={CollectionRowItem}
                rangeChanged={({ startIndex }) => setFirstVisibleIdx(startIndex)}
                className="collection-vlist"
                overscan={4}
              />
              )}

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
      </div>

      {/* FAB — fixed positioned, outside container */}
      {collectionMeta && (
        <CollectionFab onClick={() => setQuickAddOpen(v => !v)} />
      )}

      {/* Mobile overflow sheet */}
      {overflowSheetOpen && (
        <CollectionOverflowSheet
          collectionMeta={collectionMeta}
          onClose={() => setOverflowSheetOpen(false)}
          onUploadClick={() => csvInputRef.current?.click()}
          onBulkEditClick={() => setBulkEditOpen(!bulkEditOpen)}
          onOpenTradeClick={onOpenTrade}
        />
      )}

      {undoToast && (
        <div className="undo-toast" role="status">
          <span className="undo-toast-message">{undoToast}</span>
          <button className="undo-toast-btn" onClick={handleUndo}>Undo</button>
          <div key={toastKey} className="undo-toast-bar" />
        </div>
      )}
    </section>
  );
}
