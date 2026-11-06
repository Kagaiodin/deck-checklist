import { useEffect, useId, useRef, useState } from "react";
import type { Collection } from "../../../types/index";
import { EmptyState } from "../../../components/EmptyState";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import { primaryPrinting, surplusLabel, type Binder, type BinderRow } from "./binderSurplus";
import { BinderRowSheet } from "./BinderRowSheet";
import { PrintingList } from "./PrintingList";
import "../TxRow.css";
import "./BinderPanel.css";

interface BinderPanelProps {
  collection: Collection;
  binder: Binder & { exclude: (key: string) => void; restore: (key: string) => void };
  onNewTrade: () => void;
  onAddToTrade: (row: BinderRow) => void;
  onViewCollection: () => void;
}

const ICON = (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 7h12l-3-3M17 17H5l3 3" />
  </svg>
);

function subtitle(row: BinderRow, kept: boolean): string {
  const p = primaryPrinting(row);
  const bits: string[] = [];
  if (p?.set) bits.push(p.set.toUpperCase());
  if (p?.foil) bits.push("Foil");
  bits.push(kept
    ? `Own ${row.owned}${row.committed > 0 ? ` · ${row.committed} in decks` : ""}`
    : surplusLabel(row).replace(/ · \d+ spare$/, ""));
  return bits.join(" · ");
}

export function BinderPanel({ collection, binder, onNewTrade, onAddToTrade, onViewCollection }: BinderPanelProps) {
  const { rows, excludedRows, exclude, restore } = binder;
  const mobile = useMediaQuery("(max-width: 767px)");
  const [keepOpen, setKeepOpen] = useState(false);
  const [sheetRow, setSheetRow] = useState<BinderRow | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const idBase = useId();
  const [toast, setToast] = useState<{ key: string; message: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function doExclude(row: BinderRow) {
    exclude(row.key);
    if (timer.current) clearTimeout(timer.current);
    setToast({ key: row.key, message: `${row.name} kept out of Binder.` });
    timer.current = setTimeout(() => setToast(null), 30_000);
  }
  function toggleExpanded(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }
  function undo() {
    if (toast) restore(toast.key);
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }

  if (Object.keys(collection).length === 0) {
    return (
      <EmptyState
        icon={ICON}
        title="Import a collection to see spare cards"
        body="Binder lists copies you own beyond what your decks need."
        primary={{ label: "Go to Collection", onClick: onViewCollection }}
      />
    );
  }

  const spareCopies = rows.reduce((n, r) => n + r.surplus, 0);
  const keepToggle = excludedRows.length > 0 && (
    <button
      type="button"
      className="keep-toggle"
      aria-expanded={keepOpen}
      aria-controls="binder-keep-list"
      onClick={() => setKeepOpen(o => !o)}
    >
      Keep these <span className="num">{excludedRows.length}</span>
    </button>
  );

  return (
    <div className="binder">
      {rows.length === 0 ? (
        excludedRows.length > 0 ? (
          <>
            <EmptyState
              icon={ICON}
              title="Everything spare is kept out"
              body={`${excludedRows.length} ${excludedRows.length === 1 ? "card is" : "cards are"} hidden by Keep these. Show them again to trade them from here.`}
              primary={{ label: "Show Keep these", onClick: () => setKeepOpen(true) }}
            />
            <div className="binder-meta binder-meta-end">{keepToggle}</div>
          </>
        ) : (
          <EmptyState
            icon={ICON}
            title="No spare cards right now"
            body="Binder lists copies you own beyond what your decks need. While every copy is in a deck, nothing shows here."
            primary={{ label: "New trade", onClick: onNewTrade }}
            secondary={{ label: "View collection", onClick: onViewCollection }}
          />
        )
      ) : (
        <>
          <div className="binder-meta">
            <p>
              <span className="num">{rows.length}</span> {rows.length === 1 ? "card" : "cards"} ·{" "}
              <span className="num">{spareCopies}</span> spare {spareCopies === 1 ? "copy" : "copies"}. Copies you own beyond what your decks need.
            </p>
            {keepToggle}
          </div>
          <ul className="binder-list" aria-label="Spare cards">
            {rows.map((row, i) => {
              // Printings show on expansion (desktop) or in the row sheet (phone), only when there is more than one.
              const expandable = !mobile && row.printings.length > 1;
              const open = expandable && expanded.has(row.key);
              const listId = `${idBase}-printings-${i}`;
              return (
              <li key={row.key} className="tx-row binder-row">
                <div className="tx-row-main">
                  <span className="tx-row-name binder-row-name">{row.name}</span>
                  <span className="tx-row-sub binder-row-sub">{subtitle(row, false)}</span>
                  {expandable && (
                    <button
                      type="button"
                      className="binder-printings-toggle"
                      aria-expanded={open}
                      aria-controls={open ? listId : undefined}
                      aria-label={`${row.printings.length} printings of ${row.name}`}
                      onClick={() => toggleExpanded(row.key)}
                    >
                      <span aria-hidden="true">{open ? "▾" : "▸"}</span> {row.printings.length} printings
                    </button>
                  )}
                </div>
                <div className="binder-qty"><b>{row.surplus}</b><span>spare</span></div>
                {mobile ? (
                  <button
                    type="button"
                    className="binder-more"
                    aria-label={`Actions for ${row.name}`}
                    aria-haspopup="dialog"
                    onClick={() => setSheetRow(row)}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                      <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
                    </svg>
                  </button>
                ) : (
                  <div className="binder-actions">
                    <button type="button" className="btn btn-ghost btn-sm" aria-label={`Exclude ${row.name} from Binder`} onClick={() => doExclude(row)}>
                      Exclude
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" aria-label={`Add to new trade: ${row.name}`} onClick={() => onAddToTrade(row)}>
                      Add to new trade
                    </button>
                  </div>
                )}
                {open && <PrintingList row={row} id={listId} className="binder-printings-row" />}
              </li>
              );
            })}
          </ul>
        </>
      )}

      {keepOpen && excludedRows.length > 0 && (
        <div id="binder-keep-list" className="binder-keep">
          <div className="binder-kept-head">
            <h2>Keep these</h2>
            <p>Hidden from Binder. They stay in your Collection.</p>
          </div>
          <ul className="binder-list" aria-label="Kept out of Binder">
            {excludedRows.map(row => (
              <li key={row.key} className="tx-row binder-row binder-row-kept">
                <div className="tx-row-main">
                  <span className="tx-row-name binder-row-name">{row.name}</span>
                  <span className="tx-row-sub binder-row-sub">{subtitle(row, true)}</span>
                </div>
                <button type="button" className="btn btn-secondary btn-sm binder-restore" aria-label={`Show in Binder: ${row.name}`} onClick={() => restore(row.key)}>
                  Show in Binder
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sheetRow && (
        <BinderRowSheet row={sheetRow} onClose={() => setSheetRow(null)} onAddToTrade={onAddToTrade} onExclude={doExclude} />
      )}

      {toast && (
        <div className="undo-toast" role="status">
          <span className="undo-toast-message">{toast.message}</span>
          <button type="button" className="undo-toast-btn" onClick={undo}>Undo</button>
        </div>
      )}
    </div>
  );
}
