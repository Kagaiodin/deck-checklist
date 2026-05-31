import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Card, AcquisitionSource } from "../types/index";

type SheetStatus = "owned" | "need_to_buy" | "ordered" | "proxy";

const STATUS_OPTS: { key: SheetStatus; label: string; cls: string }[] = [
  { key: "owned",       label: "Owned",       cls: "sheet-status-owned"   },
  { key: "need_to_buy", label: "Need",        cls: "sheet-status-need"    },
  { key: "ordered",     label: "Ordered",     cls: "sheet-status-ordered"  },
  { key: "proxy",       label: "Proxy",       cls: "sheet-status-proxy"    },
];

function isSheetStatus(s: AcquisitionSource | undefined): s is SheetStatus {
  return s === "owned" || s === "need_to_buy" || s === "ordered" || s === "proxy";
}

function rarityLabel(rarity: string): string {
  if (rarity === "mythic") return "M";
  if (rarity === "rare") return "R";
  if (rarity === "uncommon") return "U";
  if (rarity === "special" || rarity === "bonus") return "S";
  return "C";
}

interface Props {
  card: Card;
  deckId: string;
  onClose: () => void;
  onSetSource: (cardId: string, source: AcquisitionSource | undefined) => void;
  onRemoveCard: (cardId: string) => void;
}

export function CardRowSheet({ card, deckId: _deckId, onClose, onSetSource, onRemoveCard }: Props) {
  const [visible, setVisible] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const firstPillRef = useRef<HTMLButtonElement>(null);

  // Track touch position for swipe-to-dismiss
  const touchStartY = useRef(0);
  const touchCurrentY = useRef(0);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 220);
  }, [onClose]);

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Focus first pill when open
  useEffect(() => {
    if (visible) firstPillRef.current?.focus();
  }, [visible]);

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showConfirm) {
        setShowConfirm(false);
      } else {
        handleClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showConfirm, handleClose]);

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
    const sheetHeight = sheetRef.current?.offsetHeight ?? 400;
    if (delta > sheetHeight * 0.3) {
      handleClose();
    } else if (sheetRef.current) {
      sheetRef.current.style.transform = "";
    }
  }

  function handleStatusChange(s: SheetStatus) {
    onSetSource(card.id, s);
  }

  function handleViewPrintings() {
    handleClose();
    window.open(
      `https://scryfall.com/search?q=!"${encodeURIComponent(card.name)}"&unique=prints`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function handleRemoveConfirm() {
    onRemoveCard(card.id);
    handleClose();
  }

  const setChipClass = card.rarity
    ? `row-set-chip card-rarity-${card.rarity}`
    : "row-set-chip";

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
        aria-labelledby="sheet-card-name"
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="sheet-handle"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />

        <div className="sheet-header">
          <div id="sheet-card-name" className="sheet-card-name">{card.name}</div>
          <div className="sheet-card-meta">
            {card.set && card.rarity && (
              <span className={setChipClass}>
                {card.set} · {rarityLabel(card.rarity)}
              </span>
            )}
            {card.inputName && (
              <span className="sheet-alt">{card.inputName}</span>
            )}
          </div>
        </div>

        <div className="sheet-body">
          {showConfirm ? (
            <div className="sheet-confirm">
              <div className="sheet-confirm-title">Remove {card.name}?</div>
              <div className="sheet-confirm-body">
                This will delete it from the deck. This can&apos;t be undone.
              </div>
              <div className="sheet-confirm-actions">
                <button
                  className="sheet-confirm-btn sheet-confirm-cancel"
                  onClick={() => setShowConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  className="sheet-confirm-btn sheet-confirm-remove"
                  onClick={handleRemoveConfirm}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="sheet-section-label">Status</div>
              <div className="sheet-status-options" role="group" aria-label="Status">
                {STATUS_OPTS.map(({ key, label, cls }, i) => (
                  <button
                    key={key}
                    ref={i === 0 ? firstPillRef : undefined}
                    role="radio"
                    aria-checked={card.source === key}
                    className={`sheet-status-opt ${cls}${isSheetStatus(card.source) && card.source === key ? " active" : ""}`}
                    onClick={() => handleStatusChange(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="sheet-divider" />

              <button className="sheet-action" onClick={handleViewPrintings}>
                <span className="sheet-action-icon sheet-icon-blue">↗</span>
                <span className="sheet-action-body">
                  <span className="sheet-action-label">View all printings</span>
                  <span className="sheet-action-desc">Browse other editions of this card</span>
                </span>
                <span className="sheet-action-chevron">›</span>
              </button>

              <div className="sheet-divider" />

              <button className="sheet-action danger" onClick={() => setShowConfirm(true)}>
                <span className="sheet-action-icon sheet-icon-red">✕</span>
                <span className="sheet-action-body">
                  <span className="sheet-action-label">Remove from deck</span>
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
