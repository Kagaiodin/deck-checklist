import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { CollectionMeta } from "../../../types/index";

function relativeTime(timestamp: number): string {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

interface CollectionOverflowSheetProps {
  collectionMeta: CollectionMeta | null;
  onClose: () => void;
  onUploadClick: () => void;
  onBulkEditClick: () => void;
}

export function CollectionOverflowSheet({
  collectionMeta,
  onClose,
  onUploadClick,
  onBulkEditClick,
}: CollectionOverflowSheetProps) {
  const [visible, setVisible] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const touchCurrentY = useRef(0);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 220);
  }, [onClose]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleClose]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
  }

  function onTouchMove(e: React.TouchEvent) {
    touchCurrentY.current = e.touches[0].clientY;
    const delta = touchCurrentY.current - touchStartY.current;
    if (delta > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
  }

  function onTouchEnd() {
    const delta = touchCurrentY.current - touchStartY.current;
    const sheetHeight = sheetRef.current?.offsetHeight ?? 300;
    if (delta > sheetHeight * 0.3) {
      handleClose();
    } else if (sheetRef.current) {
      sheetRef.current.style.transform = "";
    }
  }

  return createPortal(
    <div
      className={`card-row-sheet-scrim${visible ? " scrim-visible" : ""}`}
      onClick={handleClose}
      aria-hidden="true"
    >
      <div
        ref={sheetRef}
        className={`card-row-sheet${visible ? " sheet-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Collection options"
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="sheet-handle" />

        {!collectionMeta && (
          <button
            className="sheet-action"
            onClick={() => { handleClose(); onUploadClick(); }}
          >
            <div className="sheet-action-icon sheet-icon-blue">📥</div>
            <div className="sheet-action-body">
              <span className="sheet-action-label">Upload CSV</span>
            </div>
          </button>
        )}

        <button
          className="sheet-action"
          onClick={() => { handleClose(); onBulkEditClick(); }}
        >
          <div className="sheet-action-icon sheet-icon-purple">✏️</div>
          <div className="sheet-action-body">
            <span className="sheet-action-label">Bulk edit</span>
          </div>
        </button>

        {collectionMeta && (
          <button
            className="sheet-action"
            onClick={() => { handleClose(); onUploadClick(); }}
          >
            <div className="sheet-action-icon sheet-icon-blue">↺</div>
            <div className="sheet-action-body">
              <span className="sheet-action-label">Replace CSV</span>
              <span className="sheet-action-desc">
                {collectionMeta.fileName} · {relativeTime(collectionMeta.importedAt)}
              </span>
            </div>
          </button>
        )}

        <div className="sheet-divider" />

        <button className="sheet-action collection-sheet-cancel" onClick={handleClose}>
          <div className="sheet-action-body">
            <span className="sheet-action-label">Cancel</span>
          </div>
        </button>
      </div>
    </div>,
    document.body
  );
}
