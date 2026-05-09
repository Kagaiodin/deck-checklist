import { useState, useRef, useEffect } from "react";
import type { Card, Deck, AcquisitionSource } from "../types/index";
import { ACQUISITION_SOURCES } from "../types/index";

interface Props {
  deck: Deck;
  onToggleAcquired: (cardId: string) => void;
  onSetSource: (cardId: string, source: AcquisitionSource | undefined) => void;
  onBulkSetSource: (cardIds: string[], source: AcquisitionSource | undefined) => void;
}

type GroupBy = "none" | "color" | "type" | "source";

const COLOR_LABELS: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green"
};

// Color-coded source tags
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

// Dropdown for picking a source on a single card
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
  );
}

export function Checklist({ deck, onToggleAcquired, onSetSource, onBulkSetSource }: Props) {
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState<AcquisitionSource | "untagged" | "">("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [bulkSource, setBulkSource] = useState<AcquisitionSource | "">("");

  function toggleSelectMode() {
    setSelectMode(prev => !prev);
    setSelectedIds(new Set());
    setBulkSource("");
  }

  const query = search.trim();

  const visibleCards = deck.cards
    .filter(c => !showMissingOnly || !c.acquired)
    .filter(c => !query || matchesSearch(c, query))
    .filter(c => {
      if (!filterSource) return true;
      if (filterSource === "untagged") return !c.source;
      return c.source === filterSource;
    });

  const groups = groupCards(visibleCards, groupBy);

  const totalCards = deck.cards.reduce((sum, c) => sum + c.quantity, 0);
  const totalItems = deck.cards.length;
  const acquiredCards = deck.cards.filter(c => c.acquired).reduce((sum, c) => sum + c.quantity, 0);

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
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      });
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

  const selectedCount = selectedIds.size;

  return (
    <div className="checklist">
      <div className="checklist-header">
        <div className="checklist-stats">
          <span>
            {acquiredCards} / {totalCards} cards acquired
            <span className="stats-items-note"> · {totalItems} items</span>
          </span>
          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{ width: totalCards > 0 ? `${(acquiredCards / totalCards) * 100}%` : "0%" }}
            />
          </div>
        </div>

        <div className="checklist-search">
          <input
            className="search-input"
            type="search"
            placeholder="Search cards…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="checklist-controls">
          <label className="control-label">
            Group by:
            <select
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as GroupBy)}
              className="control-select"
            >
              <option value="none">None</option>
              <option value="color">Color</option>
              <option value="type">Type</option>
              <option value="source">Source</option>
            </select>
          </label>

          <label className="control-label">
            Source:
            <select
              value={filterSource}
              onChange={e => setFilterSource(e.target.value as AcquisitionSource | "untagged" | "")}
              className="control-select"
            >
              <option value="">All</option>
              <option value="untagged">Untagged</option>
              {ACQUISITION_SOURCES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>

          <label className="control-label toggle-label">
            <input
              type="checkbox"
              checked={showMissingOnly}
              onChange={e => setShowMissingOnly(e.target.checked)}
            />
            Missing only
          </label>

          <button
            className={`btn btn-ghost btn-select-mode${selectMode ? " active" : ""}`}
            onClick={toggleSelectMode}
          >
            {selectMode ? "Done" : "Select"}
          </button>
        </div>

        {/* Bulk action bar */}
        {selectedCount > 0 && (
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
            <button
              className="btn btn-primary btn-sm"
              onClick={applyBulkSource}
              disabled={!bulkSource}
            >
              Apply
            </button>
            <button className="btn btn-ghost btn-sm" onClick={clearBulkSelection}>Cancel</button>
          </div>
        )}
      </div>

      {groups.map(([groupName, cards]) => (
        <div key={groupName} className="card-group">
          {groupBy !== "none" && (
            <h3 className="group-title">
              {groupName} <span className="group-count">({cards.length})</span>
            </h3>
          )}
          <ul className="card-list">
            {/* Select-all row — only in select mode */}
            {selectMode && cards.length > 0 && (
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
              return (
                <li
                  key={card.id}
                  className={`card-row${card.acquired ? " acquired" : ""}${isSelected ? " selected" : ""}`}
                  onClick={() => selectMode ? toggleSelect(card.id) : onToggleAcquired(card.id)}
                >
                  {selectMode ? (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(card.id)}
                      onClick={e => e.stopPropagation()}
                      className="card-checkbox"
                    />
                  ) : (
                    <input
                      type="checkbox"
                      checked={card.acquired}
                      onChange={() => onToggleAcquired(card.id)}
                      onClick={e => e.stopPropagation()}
                      className="card-checkbox"
                    />
                  )}
                  <span className="card-qty">{card.quantity}x</span>
                  <span className="card-name">
                    <span className="card-name-primary">{card.name}</span>
                    {card.inputName && <span className="card-input-name">{card.inputName}</span>}
                  </span>
                  <span className="card-type">{card.type}</span>

                  {/* Source tag */}
                  <div className="source-tag-wrapper" onClick={e => e.stopPropagation()}>
                    <button
                      className={`source-tag${card.source ? " has-source" : ""}`}
                      style={style ? { background: style.bg, color: style.color } as React.CSSProperties : undefined}
                      onClick={() => setOpenPickerId(openPickerId === card.id ? null : card.id)}
                      title="Set acquisition source"
                    >
                      {card.source ? sourceLabel(card.source) : "+ source"}
                    </button>
                    {openPickerId === card.id && (
                      <SourcePicker
                        current={card.source}
                        onSelect={source => onSetSource(card.id, source)}
                        onClose={() => setOpenPickerId(null)}
                      />
                    )}
                  </div>
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
