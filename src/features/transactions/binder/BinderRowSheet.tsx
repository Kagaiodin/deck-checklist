import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDialogKeys } from "../../../hooks/useDialogKeys";
import { surplusLabel, type BinderRow } from "./binderSurplus";
import { PrintingList } from "./PrintingList";

interface BinderRowSheetProps {
  row: BinderRow;
  onClose: () => void;
  onAddToTrade: (row: BinderRow) => void;
  onExclude: (row: BinderRow) => void;
}

/** Phone row actions, built on the card-row bottom sheet's classes. */
export function BinderRowSheet({ row, onClose, onAddToTrade, onExclude }: BinderRowSheetProps) {
  const [visible, setVisible] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  useDialogKeys(sheetRef, onClose, { initialFocus: () => firstRef.current });

  return createPortal(
    <div className={`card-row-sheet-scrim${visible ? " scrim-visible" : ""}`} onClick={onClose}>
      <div
        ref={sheetRef}
        className={`card-row-sheet${visible ? " sheet-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="binder-sheet-name"
        onClick={e => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div id="binder-sheet-name" className="sheet-card-name">{row.name}</div>
          <div className="sheet-card-meta">{surplusLabel(row)}</div>
          {row.printings.length > 1 && <PrintingList row={row} className="binder-printings-sheet" />}
        </div>
        <div className="sheet-body">
          <button ref={firstRef} type="button" className="sheet-action" onClick={() => { onAddToTrade(row); onClose(); }}>
            <span className="sheet-action-body">
              <span className="sheet-action-label">Add to a new trade</span>
              <span className="sheet-action-desc">Opens the Calculator with this card on your side.</span>
            </span>
          </button>
          <button type="button" className="sheet-action" onClick={() => { onExclude(row); onClose(); }}>
            <span className="sheet-action-body">
              <span className="sheet-action-label">Exclude from Binder</span>
              <span className="sheet-action-desc">Keep this card. It stays in your Collection.</span>
            </span>
          </button>
          <button type="button" className="sheet-action" onClick={onClose}>
            <span className="sheet-action-body"><span className="sheet-action-label">Cancel</span></span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
