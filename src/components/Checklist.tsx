import { useState, useRef, useEffect } from "react";
import type { Card, Deck, AcquisitionSource } from "../types/index";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { ACQUISITION_SOURCES } from "../types/index";

const SEGMENT_SOURCES: Array<{ key: AcquisitionSource | "untagged"; color: string; label: string }> = [
  { key: "owned",           color: "#4ade80", label: "Owned" },
  { key: "ordered",         color: "#60a5fa", label: "Ordered" },
  { key: "proxy",           color: "#c084fc", label: "Proxy" },
  { key: "in_another_deck", color: "#facc15", label: "In another deck" },
  { key: "need_to_buy",     color: "#f87171", label: "Need to buy" },
  { key: "borrowed",        color: "#fb923c", label: "Borrowed" },
  { key: "in_binder",       color: "#2dd4bf", label: "In binder" },
  { key: "in_storage",      color: "#94a3b8", label: "In storage" },
  { key: "untagged",        color: "transparent", label: "Untagged" },
];

interface Props {
  deck: Deck;
  editMode: boolean;
  selectMode: boolean;
  onToggleAcquired: (cardId: string) => void;
  onSetSource: (cardId: string, source: AcquisitionSource | undefined) => void;
  onBulkSetSource: (cardIds: string[], source: AcquisitionSource | undefined) => void;
  onRemoveCard: (cardId: string) => void;
  onUpdateQuantity: (cardId: string, quantity: number) => void;
  onAddCard: (name: string) => Promise<{ success: boolean; error?: string }>;
  /** When set, only cards whose IDs are in this array are shown (used by notification "Show cards"). */
  filterCardIds?: string[];
  // ── Buy CTA (inline filter pill + Shop dropdown) ─────────────────────────
  /** Total card quantity flagged need_to_buy. 0 = hide the pill. */
  toBuyTotal?: number;
  /** Called when user picks a vendor from the Shop dropdown. */
  onSendToVendor?: (vendorIndex: number) => void;
  /** Vendor list passed through from App for the dropdown. */
  vendors?: Array<{ label: string; prefill: boolean }>;
  /** Label of the last-used vendor (shows checkmark). */
  sentVendor?: string | null;
}

type GroupBy = "none" | "color" | "type" | "source";

const COLOR_LABELS: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green"
};

const COLOR_FILTERS = [
  { value: "W", label: "W", title: "White" },
  { value: "U", label: "U", title: "Blue" },
  { value: "B", label: "B", title: "Black" },
  { value: "R", label: "R", title: "Red" },
  { value: "G", label: "G", title: "Green" },
  { value: "colorless", label: "C", title: "Colorless" },
  { value: "multi", label: "M", title: "Multicolor" },
] as const;

const MAIN_TYPES = ["Creature", "Instant", "Sorcery", "Enchantment", "Artifact", "Planeswalker", "Land", "Battle", "Tribal"] as const;

function extractMainType(typeStr: string): string {
  const beforeDash = typeStr.split("—")[0].trim();
  for (const t of MAIN_TYPES) {
    if (beforeDash.includes(t)) return t;
  }
  return beforeDash;
}

const SOURCE_STYLES: Record<AcquisitionSource, { bg: string; color: string }> = {
  owned:           { bg: "rgba(34,197,94,.18)",   color: "#4ade80" },
  ordered:         { bg: "rgba(59,130,246,.18)",  color: "#60a5fa" },
  proxy:           { bg: "rgba(168,85,247,.18)",  color: "#c084fc" },
  in_another_deck: { bg: "rgba(234,179,8,.18)",   color: "#facc15" },
  need_to_buy:     { bg: "rgba(239,68,68,.18)",   color: "#f87171" },
  borrowed:        { bg: "rgba(249,115,22,.18)",  color: "#fb923c" },
  in_binder:       { bg: "rgba(20,184,166,.18)",  color: "#2dd4bf" },
  in_storage:      { bg: "rgba(148,163,184,.18)", color: "#94a3b8" },
};

function sourceLabel(source: AcquisitionSource | undefined): string {
  if (!source) return "";
  return ACQUISITION_SOURCES.find(s => s.value === source)?.label ?? source;
}

function colorLabel(colors: string[]): string {
  if (colors.length === 0) return "Colorless";
  if (colors.length > 1) return "Multicolor";
  return COLOR_LABELS[colors[0]] ?? colors[0];
}

function groupCards(cards: Card[], groupBy: GroupBy): [string, Card[]][] {
  if (groupBy === "none") return [["All Cards", cards]];

  const map = new Map<string, Card[]>();
  for (const card of cards) {
    let key: string;
    if (groupBy === "color") key = colorLabel(card.color);
    else if (groupBy === "type") key = card.type;
    else key = card.source ? sourceLabel(card.source) : "Untagged";

    const bucket = map.get(key) ?? [];
    bucket.push(card);
    map.set(key, bucket);
  }

  return Array.from(map.entries()).sort((a, b) => {
    if (a[0] === "Untagged") return 1;
    if (b[0] === "Untagged") return -1;
    return a[0].localeCompare(b[0]);
  });
}

function matchesSearch(card: Card, query: string): boolean {
  const q = query.toLowerCase();
  return (
    card.name.toLowerCase().includes(q) ||
    (card.inputName?.toLowerCase().includes(q) ?? false) ||
    card.type.toLowerCase().includes(q)
  );
}

// ─── Source picker dropdown ───────────────────────────────────────────────────
function SourcePicker({
  current,
  onSelect,
  onClose,
}: {
  current: AcquisitionSource | undefined;
  onSelect: (s: AcquisitionSource | undefined) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <>
      <div className="mobile-sheet-backdrop" onClick={onClose} />
      <div className="source-picker" ref={ref}>
      {current && (
        <button
          className="source-picker-item source-picker-clear"
          onClick={() => { onSelect(undefined); onClose(); }}
        >
          Clear tag
        </button>
      )}
      {ACQUISITION_SOURCES.map(s => (
        <button
          key={s.value}
          className={`source-picker-item${current === s.value ? " active" : ""}`}
          style={SOURCE_STYLES[s.value] as React.CSSProperties}
          onClick={() => { onSelect(s.value); onClose(); }}
        >
          {s.label}
        </button>
      ))}
      </div>
    </>
  );
}

// ─── Add card row (shown at bottom in edit mode) ──────────────────────────────
function AddCardRow({ onAdd }: { onAdd: (name: string) => Promise<{ success: boolean; error?: string }> }) {
  const [value, setValue] = useState("");
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlighted, setHighlighted] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function fetchSuggestions(q: string) {
    if (q.length < 2) { setSuggestions([]); return; }
    try {
      const res = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`);
      const data = await res.json() as { data: string[] };
      setSuggestions(data.data?.slice(0, 8) ?? []);
    } catch {
      setSuggestions([]);
    }
  }

  function handleInput(val: string) {
    setValue(val);
    setError(null);
    setHighlighted(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 250);
  }

  async function submit(nameOverride?: string) {
    const name = (nameOverride ?? value).trim();
    if (!name) return;
    setSuggestions([]);
    setLoading(true);
    setError(null);
    const result = await onAdd(`${qty} ${name}`);
    setLoading(false);
    if (result.success) {
      setValue("");
      setQty(1);
      inputRef.current?.focus();
    } else {
      setError(result.error ?? "Card not found on Scryfall.");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted(h => Math.min(h + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted(h => Math.max(h - 1, -1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted >= 0 && suggestions[highlighted]) {
        setValue(suggestions[highlighted]);
        setSuggestions([]);
        setHighlighted(-1);
      } else {
        void submit();
      }
    } else if (e.key === "Escape") {
      setSuggestions([]);
      setHighlighted(-1);
    }
  }

  return (
    <li className="card-row add-card-row">
      <input
        type="number"
        className="add-card-qty"
        value={qty}
        min={1}
        max={99}
        onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
      />
      <div className="add-card-autocomplete">
        <input
          ref={inputRef}
          className="add-card-input"
          placeholder="Add card…"
          value={value}
          onChange={e => handleInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          autoComplete="off"
        />
        {suggestions.length > 0 && (
          <ul className="autocomplete-list">
            {suggestions.map((s, i) => (
              <li
                key={s}
                className={`autocomplete-item${i === highlighted ? " highlighted" : ""}`}
                onMouseDown={() => { setValue(s); setSuggestions([]); void submit(s); }}
              >
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        className="btn btn-primary btn-sm"
        onClick={() => void submit()}
        disabled={loading || !value.trim()}
      >
        {loading ? "…" : "Add"}
      </button>
      {error && <span className="add-card-error">{error}</span>}
    </li>
  );
}

// ─── Main Checklist component ─────────────────────────────────────────────────
export function Checklist({ deck, editMode, selectMode, onToggleAcquired, onSetSource, onBulkSetSource, onRemoveCard, onUpdateQuantity, onAddCard, filterCardIds, toBuyTotal, onSendToVendor, vendors, sentVendor }: Props) {
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState<AcquisitionSource | "untagged" | "">("");
  const [filterColor, setFilterColor] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"none" | "name-asc" | "name-desc" | "qty-asc" | "qty-desc">("name-asc");
  const [sortOpen, setSortOpen] = useState(false);
  const sortPickerRef = useRef<HTMLDivElement>(null);

  // Derive available types from this deck's cards (in MAIN_TYPES order)
  const availableTypes = MAIN_TYPES.filter(t => deck.cards.some(c => extractMainType(c.type) === t));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [bulkSource, setBulkSource] = useState<AcquisitionSource | "">("");
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState("");
  const [displayOpen, setDisplayOpen] = useState(false);
  const displayMenuRef = useRef<HTMLDivElement>(null);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const groupPickerRef = useRef<HTMLDivElement>(null);

  // ── Shop dropdown (buy pill) ─────────────────────────────────────────────
  const [shopOpen, setShopOpen] = useState(false);
  const shopMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shopOpen) return;
    function handler(e: MouseEvent) {
      if (shopMenuRef.current && !shopMenuRef.current.contains(e.target as Node)) {
        setShopOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [shopOpen]);

  // Coachmark dismissal — persisted per deck ID
  const [dismissedDeckIds, setDismissedDeckIds] = useLocalStorage<string[]>(
    "fetchlist-coachmark-dismissed-decks",
    []
  );
  function dismissCoachmark() {
    setDismissedDeckIds(prev =>
      prev.includes(deck.id) ? prev : [...prev, deck.id]
    );
  }

  const query = search.trim();

  const visibleCards = deck.cards
    .filter(c => !filterCardIds || filterCardIds.includes(c.id))
    .filter(c => !showMissingOnly || !c.acquired)
    .filter(c => !query || matchesSearch(c, query))
    .filter(c => {
      if (!filterSource) return true;
      if (filterSource === "untagged") return !c.source;
      return c.source === filterSource;
    })
    .filter(c => {
      if (filterColor.size === 0) return true;
      return [...filterColor].some(fc => {
        if (fc === "colorless") return c.color.length === 0;
        if (fc === "multi") return c.color.length > 1;
        return c.color.includes(fc);
      });
    })
    .filter(c => filterType.size === 0 || filterType.has(extractMainType(c.type)))
    .sort((a, b) => {
      if (sortBy === "name-asc")  return a.name.localeCompare(b.name);
      if (sortBy === "name-desc") return b.name.localeCompare(a.name);
      if (sortBy === "qty-desc")  return b.quantity - a.quantity || a.name.localeCompare(b.name);
      if (sortBy === "qty-asc")   return a.quantity - b.quantity || a.name.localeCompare(b.name);
      return 0;
    });

  const groups = groupCards(visibleCards, groupBy);

  const totalCards = deck.cards.reduce((sum, c) => sum + c.quantity, 0);
  const acquiredCards = deck.cards.filter(c => c.acquired).reduce((sum, c) => sum + c.quantity, 0);

  const untaggedCount = deck.cards.filter(c => !c.source).length;
  const showCoachmark =
    deck.cards.length > 0 &&
    acquiredCards === 0 &&
    untaggedCount === deck.cards.length &&
    !dismissedDeckIds.includes(deck.id);

  const visibleIds = visibleCards.map(c => c.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(prev => { const next = new Set(prev); visibleIds.forEach(id => next.delete(id)); return next; });
    } else {
      setSelectedIds(prev => new Set([...prev, ...visibleIds]));
    }
  }

  function applyBulkSource() {
    if (!bulkSource) return;
    onBulkSetSource([...selectedIds], bulkSource as AcquisitionSource);
    setBulkSource("");
    setSelectedIds(new Set());
  }

  function clearBulkSelection() {
    setSelectedIds(new Set());
    setBulkSource("");
  }

  function startEditQty(card: Card) {
    setEditingQtyId(card.id);
    setQtyDraft(String(card.quantity));
  }

  function commitQty(cardId: string) {
    const qty = parseInt(qtyDraft);
    if (!isNaN(qty) && qty > 0) onUpdateQuantity(cardId, qty);
    setEditingQtyId(null);
  }

  async function handleAddCard(line: string) {
    const result = await onAddCard(line);
    return result;
  }

  useEffect(() => {
    if (!displayOpen) return;
    function handleClick(e: MouseEvent) {
      if (displayMenuRef.current && !displayMenuRef.current.contains(e.target as Node)) {
        setDisplayOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [displayOpen]);

  useEffect(() => {
    if (!groupPickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (groupPickerRef.current && !groupPickerRef.current.contains(e.target as Node)) {
        setGroupPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [groupPickerOpen]);

  useEffect(() => {
    if (!sortOpen) return;
    function handleClick(e: MouseEvent) {
      if (sortPickerRef.current && !sortPickerRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [sortOpen]);

  // Source breakdown for segmented progress bar + pill counts
  const sourceBreakdown = new Map<string, number>();
  for (const card of deck.cards) {
    const key = card.source ?? "untagged";
    sourceBreakdown.set(key, (sourceBreakdown.get(key) ?? 0) + card.quantity);
  }

  // Type breakdown for pill counts
  const typeBreakdown = new Map<string, number>();
  for (const card of deck.cards) {
    const t = extractMainType(card.type);
    typeBreakdown.set(t, (typeBreakdown.get(t) ?? 0) + card.quantity);
  }

  const SORT_OPTIONS: { value: typeof sortBy; label: string; shortLabel: string }[] = [
    { value: "name-asc",  label: "Name A → Z", shortLabel: "Name ↑" },
    { value: "name-desc", label: "Name Z → A", shortLabel: "Name ↓" },
    { value: "qty-desc",  label: "Qty ↓",      shortLabel: "Qty ↓"  },
    { value: "qty-asc",   label: "Qty ↑",      shortLabel: "Qty ↑"  },
    { value: "none",      label: "Default",     shortLabel: "Sort"   },
  ];
  const sortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.shortLabel ?? "Sort";

  const activeFilterCount = [
    groupBy !== "none",
    filterSource !== "",
    filterColor.size > 0,
    filterType.size > 0,
    showMissingOnly,
  ].filter(Boolean).length;

  // Reset internal selection state when selectMode is turned off from parent
  useEffect(() => {
    if (!selectMode) { setSelectedIds(new Set()); setBulkSource(""); }
  }, [selectMode]);

  // Reset qty editing when editMode is turned off from parent
  useEffect(() => {
    if (!editMode) setEditingQtyId(null);
  }, [editMode]);

  const selectedCount = selectedIds.size;

  return (
    <div className={`checklist${editMode ? " edit-mode" : ""}`}>
      <div className="checklist-header">
        {/* ── Segmented progress strip ── */}
        <div className="progress-strip">
          <div className="progress-strip-top">
            <span className="progress-strip-count">
              <span className="progress-strip-num">{acquiredCards}</span>
              <span className="progress-strip-total"> / {totalCards} fetched</span>
            </span>
            <span className="progress-strip-pct">{totalCards > 0 ? Math.round((acquiredCards / totalCards) * 100) : 0}%</span>
          </div>
          <div className="progress-seg-track">
            {SEGMENT_SOURCES.map(({ key, color }) => {
              const qty = sourceBreakdown.get(key) ?? 0;
              if (qty === 0 || totalCards === 0) return null;
              const width = (qty / totalCards) * 100;
              const label = key === "untagged" ? "Untagged" : (ACQUISITION_SOURCES.find(s => s.value === key)?.label ?? key);
              return (
                <div
                  key={key}
                  className={`progress-seg${key === "untagged" ? " seg-untagged" : ""}`}
                  style={{ width: `${width}%`, background: key === "untagged" ? undefined : color }}
                  title={`${qty} ${label}`}
                />
              );
            })}
          </div>
          <div className="progress-legend">
            {SEGMENT_SOURCES.map(({ key, color, label }) => {
              const qty = sourceBreakdown.get(key) ?? 0;
              if (qty === 0) return null;
              const isActive = filterSource === key;
              return (
                <button
                  key={key}
                  className={`progress-chip${isActive ? " active" : ""}`}
                  onClick={() => setFilterSource(isActive ? "" : key as AcquisitionSource | "untagged")}
                >
                  <span className={`progress-chip-dot${key === "untagged" ? " dot-untagged" : ""}`} style={key !== "untagged" ? { background: color } : undefined} />
                  {qty} {label.toLowerCase()}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Search row ── */}
        <div className="checklist-search">
          <input
            className="search-input"
            type="search"
            placeholder="Search cards…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="sort-pill-wrap" ref={sortPickerRef}>
            <button
              className={`filter-pill sort-pill${sortOpen ? " open" : ""}${sortBy !== "none" ? " active" : ""}`}
              onClick={() => setSortOpen(v => !v)}
            >
              {sortLabel} ▾
            </button>
            {sortOpen && (
              <div className="sort-picker-dropdown">
                {SORT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`sort-picker-item${sortBy === opt.value ? " active" : ""}`}
                    onClick={() => { setSortBy(opt.value); setSortOpen(false); }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

          </div>
        </div>

        {/* ── Inline filter pills ── */}
        <div className="filter-pills-row">
          {/* Missing only toggle */}
          <button
            className={`filter-pill filter-pill-checkbox${showMissingOnly ? " active" : ""}`}
            onClick={() => setShowMissingOnly(v => !v)}
          >
            <span className={`pill-checkbox${showMissingOnly ? " checked" : ""}`} />
            Missing only
          </button>

          {/* N to buy pill — only when there are cards flagged need_to_buy */}
          {(toBuyTotal ?? 0) > 0 && (
            <button
              className={`filter-pill buy-pill${filterSource === "need_to_buy" ? " active" : ""}`}
              onClick={() => setFilterSource(prev => prev === "need_to_buy" ? "" : "need_to_buy")}
            >
              {toBuyTotal} to buy
            </button>
          )}

          {/* Shop ▾ — only visible when the buy filter is active */}
          {filterSource === "need_to_buy" && vendors && vendors.length > 0 && (
            <div className="shop-pill-wrap" ref={shopMenuRef}>
              <button
                className={`filter-pill shop-pill${shopOpen ? " open" : ""}`}
                onClick={() => setShopOpen(v => !v)}
              >
                Shop {shopOpen ? "▴" : "▾"}
              </button>
              {shopOpen && (
                <div className="buy-vendor-dropdown">
                  {vendors.map((v, i) => (
                    <button
                      key={v.label}
                      className="buy-vendor-item"
                      onClick={() => { onSendToVendor?.(i); setShopOpen(false); }}
                    >
                      <span className="buy-vendor-name">
                        {sentVendor === v.label ? `✓ ${v.label}` : v.label}
                      </span>
                      <span className="buy-vendor-hint">
                        {v.prefill ? "Pre-fills cart" : "Copies to clipboard"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Group by */}
          <div className="group-pill-wrap" ref={groupPickerRef}>
            <button
              className={`filter-pill filter-pill-group${groupPickerOpen ? " open" : ""}${groupBy !== "none" ? " active" : ""}`}
              onClick={() => setGroupPickerOpen(v => !v)}
            >
              Group{groupBy !== "none" ? `: ${groupBy.charAt(0).toUpperCase()}${groupBy.slice(1)}` : ""} ▾
            </button>
            {groupPickerOpen && (
              <>
                <div className="mobile-sheet-backdrop" onClick={() => setGroupPickerOpen(false)} />
                <div className="group-picker-dropdown">
                  {(["none", "color", "type", "source"] as GroupBy[]).map(g => (
                    <button
                      key={g}
                      className={`group-picker-item${groupBy === g ? " active" : ""}`}
                      onClick={() => { setGroupBy(g); setGroupPickerOpen(false); }}
                    >
                      {g === "none" ? "None" : `${g.charAt(0).toUpperCase()}${g.slice(1)}`}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Active source filter pill */}
          {filterSource && (
            <button
              className="filter-pill active filter-pill-dismissable"
              onClick={() => setFilterSource("")}
            >
              {filterSource === "untagged" ? "Untagged" : (ACQUISITION_SOURCES.find(s => s.value === filterSource)?.label ?? filterSource)}
              {" "}<span className="filter-pill-count">{sourceBreakdown.get(filterSource) ?? 0}</span> ✕
            </button>
          )}

          {/* Active type filter pills */}
          {[...filterType].map(t => (
            <button
              key={t}
              className="filter-pill active filter-pill-dismissable"
              onClick={() => setFilterType(prev => { const next = new Set(prev); next.delete(t); return next; })}
            >
              {t} <span className="filter-pill-count">{typeBreakdown.get(t) ?? 0}</span> ✕
            </button>
          ))}

          {/* More filters ▾ */}
          <div className="more-filters-wrap" ref={displayMenuRef}>
            <button
              className={`filter-pill${displayOpen ? " open" : ""}${filterType.size > 0 ? " active" : ""}`}
              onClick={() => setDisplayOpen(v => !v)}
            >
              {filterType.size > 0 ? `Filters (${filterType.size})` : "More ▾"}
            </button>
            {displayOpen && <div className="mobile-sheet-backdrop" onClick={() => setDisplayOpen(false)} />}
            {displayOpen && (
              <div className="display-menu-dropdown">
                <div className="display-menu-section-label">Card source</div>
                <div className="display-menu-row">
                  <select
                    value={filterSource}
                    onChange={e => { setFilterSource(e.target.value as AcquisitionSource | "untagged" | ""); setDisplayOpen(false); }}
                    className="control-select"
                    style={{ width: "100%" }}
                  >
                    <option value="">All sources</option>
                    <option value="untagged">Untagged</option>
                    {ACQUISITION_SOURCES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                {availableTypes.length > 0 && (
                  <>
                    <div className="display-menu-divider" />
                    <div className="display-menu-section-label">Card type</div>
                    <div className="display-menu-row display-menu-row-wrap">
                      <div className="type-filter-pills">
                        {availableTypes.map(t => (
                          <button
                            key={t}
                            className={`type-pill${filterType.has(t) ? " active" : ""}`}
                            onClick={() => setFilterType(prev => {
                              const next = new Set(prev);
                              next.has(t) ? next.delete(t) : next.add(t);
                              return next;
                            })}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                {activeFilterCount > 0 && (
                  <>
                    <div className="display-menu-divider" />
                    <button
                      className="display-menu-clear"
                      onClick={() => { setGroupBy("none"); setFilterSource(""); setFilterColor(new Set()); setFilterType(new Set()); setShowMissingOnly(false); setDisplayOpen(false); }}
                    >
                      Clear all filters
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

        </div>

        {/* ── Color filter row (own line so it never wraps into the pills) ── */}
        <div className="color-filter-row">
          {COLOR_FILTERS.map(cf => (
            <button
              key={cf.value}
              className={`color-pill color-pill-${cf.value}${filterColor.has(cf.value) ? " active" : ""}`}
              title={cf.title}
              onClick={() => setFilterColor(prev => {
                const next = new Set(prev);
                next.has(cf.value) ? next.delete(cf.value) : next.add(cf.value);
                return next;
              })}
            >
              {cf.label}
            </button>
          ))}
        </div>

        {/* Edit mode banner + add card */}
        {editMode && (
          <div className="edit-mode-banner">
            ✎ Edit mode — add, remove, or adjust quantities. Changes save automatically.
          </div>
        )}
        {editMode && (
          <ul className="card-list">
            <AddCardRow onAdd={handleAddCard} />
          </ul>
        )}

        {/* Bulk action bar */}
        {selectedCount > 0 && !editMode && (
          <div className="bulk-bar">
            <span className="bulk-count">{selectedCount} selected</span>
            <select
              className="control-select"
              value={bulkSource}
              onChange={e => setBulkSource(e.target.value as AcquisitionSource | "")}
            >
              <option value="">Set source…</option>
              {ACQUISITION_SOURCES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <button className="btn btn-primary btn-sm" onClick={applyBulkSource} disabled={!bulkSource}>Apply</button>
            <button className="btn btn-ghost btn-sm" onClick={clearBulkSelection}>Cancel</button>
          </div>
        )}
      </div>

      {/* ── New-deck source tagging coachmark ── */}
      {showCoachmark && (
        <div className="deck-coachmark" role="status" aria-live="polite">
          <span className="deck-coachmark-icon">🏷</span>
          <span className="deck-coachmark-text">
            Tap a card's row to tag it — <strong>Owned</strong>, <strong>Ordered</strong>,{" "}
            <strong>Proxy</strong>, or <strong>Need to buy</strong>.
          </span>
          <button
            className="deck-coachmark-dismiss"
            aria-label="Dismiss tip"
            onClick={dismissCoachmark}
          >
            ✕
          </button>
        </div>
      )}

      {groups.map(([groupName, cards]) => (
        <div key={groupName} className="card-group">
          {groupBy !== "none" && (
            <h3 className="group-title">
              {groupName.toUpperCase()}
              <span className="group-count">
                {cards.reduce((s, c) => s + c.quantity, 0)}
              </span>
            </h3>
          )}
          <ul className="card-list">
            {selectMode && !editMode && cards.length > 0 && (
              <li className="card-row card-row-select-all" onClick={toggleSelectAll}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  onClick={e => e.stopPropagation()}
                  className="card-checkbox"
                />
                <span className="card-select-all-label">Select all</span>
              </li>
            )}

            {cards.map(card => {
              const isSelected = selectedIds.has(card.id);
              const style = card.source ? SOURCE_STYLES[card.source] : undefined;
              const isEditingQty = editingQtyId === card.id;

              return (
                <li
                  key={card.id}
                  className={`card-row${card.acquired ? " acquired" : ""}${isSelected ? " selected" : ""}${editMode ? " edit-mode-row" : ""}`}
                  onClick={editMode ? undefined : selectMode ? () => toggleSelect(card.id) : () => onToggleAcquired(card.id)}
                >
                  {/* Selection checkbox — only in select mode */}
                  {selectMode && !editMode && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(card.id)}
                      onClick={e => e.stopPropagation()}
                      className="card-checkbox"
                    />
                  )}

                  {/* Acquired checkbox — hidden in edit mode and select mode */}
                  {!editMode && !selectMode && (
                    <input
                      type="checkbox"
                      checked={card.acquired}
                      onChange={() => onToggleAcquired(card.id)}
                      onClick={e => e.stopPropagation()}
                      className="card-checkbox"
                    />
                  )}

                  {/* Quantity — editable in edit mode */}
                  {editMode ? (
                    isEditingQty ? (
                      <input
                        type="number"
                        className="qty-edit-input"
                        value={qtyDraft}
                        min={1}
                        max={99}
                        autoFocus
                        onChange={e => setQtyDraft(e.target.value)}
                        onBlur={() => commitQty(card.id)}
                        onKeyDown={e => {
                          if (e.key === "Enter") commitQty(card.id);
                          if (e.key === "Escape") setEditingQtyId(null);
                        }}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <button
                        className="card-qty qty-edit-btn"
                        onClick={e => { e.stopPropagation(); startEditQty(card); }}
                        title="Click to edit quantity"
                      >
                        {card.quantity}x
                      </button>
                    )
                  ) : (
                    <span className="card-qty">{card.quantity}x</span>
                  )}

                  <span className="card-name">
                    <span className="card-name-primary">{card.name}</span>
                    <span className="card-meta">
                      {card.set && card.rarity && (
                        <span className={`card-rarity card-rarity-${card.rarity}`}>
                          {card.set} · {card.rarity === "mythic" ? "M" : card.rarity === "rare" ? "R" : card.rarity === "uncommon" ? "U" : card.rarity === "special" || card.rarity === "bonus" ? "S" : "C"}
                        </span>
                      )}
                      <a
                        className="card-printings-link"
                        href={`https://scryfall.com/search?q=!"${encodeURIComponent(card.name)}"&unique=prints`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        title="View all printings on Scryfall"
                      >
                        <span className="card-printings-label">All printings </span>↗
                      </a>
                      {card.inputName && <span className="card-input-name">{card.inputName}</span>}
                    </span>
                  </span>
                  <span className="card-type">{card.type}</span>

                  {/* Source tag — visible in both modes */}
                  <div className="source-tag-wrapper" onClick={e => e.stopPropagation()}>
                    <button
                      className={`source-tag${card.source ? " has-source" : ""}`}
                      style={style ? { background: style.bg, color: style.color } as React.CSSProperties : undefined}
                      onClick={() => setOpenPickerId(openPickerId === card.id ? null : card.id)}
                      title="Set acquisition source"
                    >
                      {card.source ? sourceLabel(card.source) : "+ card source"}
                    </button>
                    {openPickerId === card.id && (
                      <SourcePicker
                        current={card.source}
                        onSelect={source => onSetSource(card.id, source)}
                        onClose={() => setOpenPickerId(null)}
                      />
                    )}
                  </div>

                  {/* Remove button — only in edit mode */}
                  {editMode && (
                    <button
                      className="card-remove-btn"
                      onClick={e => { e.stopPropagation(); onRemoveCard(card.id); }}
                      title="Remove card"
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}

          </ul>
        </div>
      ))}

      {visibleCards.length === 0 && (
        <p className="empty-state">
          {query
            ? `No cards match "${query}".`
            : showMissingOnly
              ? "All cards acquired!"
              : filterSource
                ? "No cards with this source tag."
                : "No cards in this deck."}
        </p>
      )}
    </div>
  );
}
