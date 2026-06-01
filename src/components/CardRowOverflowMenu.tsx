import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { AcquisitionSource } from "../types/index";

type PopoverStatus = "owned" | "need_to_buy" | "ordered" | "proxy";

const STATUS_PILLS: { key: PopoverStatus; label: string; cls: string }[] = [
  { key: "owned",      label: "Owned",   cls: "pop-pill-owned"   },
  { key: "need_to_buy", label: "Need",   cls: "pop-pill-need"    },
  { key: "ordered",    label: "Ordered", cls: "pop-pill-ordered"  },
  { key: "proxy",      label: "Proxy",   cls: "pop-pill-proxy"    },
];

function isPopoverStatus(s: AcquisitionSource | undefined): s is PopoverStatus {
  return s === "owned" || s === "need_to_buy" || s === "ordered" || s === "proxy";
}

interface Props {
  cardId: string;
  cardName: string;
  currentStatus: AcquisitionSource | undefined;
  onSetSource: (cardId: string, source: AcquisitionSource | undefined) => void;
  onRemoveCard: (cardId: string) => void;
}

export function CardRowOverflowMenu({ cardId, cardName, currentStatus, onSetSource, onRemoveCard }: Props) {
  const [open, setOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [flipUp, setFlipUp] = useState(false);
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setShowConfirm(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const first = popoverRef.current?.querySelector<HTMLElement>("button");
    first?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onMouseDown(e: MouseEvent) {
      if (
        popoverRef.current?.contains(e.target as Node) ||
        btnRef.current?.contains(e.target as Node)
      ) return;
      close();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showConfirm) {
        setShowConfirm(false);
      } else {
        close();
        btnRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, showConfirm, close]);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) { close(); return; }

    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const shouldFlip = window.innerHeight - rect.bottom < 260;
      setFlipUp(shouldFlip);
      setPopStyle({
        position: "fixed",
        right: window.innerWidth - rect.right,
        ...(shouldFlip
          ? { bottom: window.innerHeight - rect.top + 6 }
          : { top: rect.bottom + 6 }),
      });
    }
    setShowConfirm(false);
    setOpen(true);
  }

  function handleStatusChange(e: React.MouseEvent, s: PopoverStatus) {
    e.stopPropagation();
    onSetSource(cardId, s);
  }

  function handleViewPrintings(e: React.MouseEvent) {
    e.stopPropagation();
    close();
    window.open(
      `https://scryfall.com/search?q=!"${encodeURIComponent(cardName)}"&unique=prints`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function handleRemoveClick(e: React.MouseEvent) {
    e.stopPropagation();
    setShowConfirm(true);
  }

  function handleConfirmRemove(e: React.MouseEvent) {
    e.stopPropagation();
    onRemoveCard(cardId);
    close();
  }

  function handleCancelConfirm(e: React.MouseEvent) {
    e.stopPropagation();
    setShowConfirm(false);
  }

  void flipUp; // flip direction encoded in popStyle

  const popover = open
    ? createPortal(
        <div
          ref={popoverRef}
          className="card-row-popover"
          role="menu"
          aria-label={`Card actions for ${cardName}`}
          style={popStyle}
        >
          {showConfirm ? (
            <div className="pop-confirm" role="alertdialog" aria-label={`Remove ${cardName} from deck`}>
              <div className="pop-confirm-text">
                <strong>Remove {cardName}?</strong>
                <br />
                This will delete it from the deck. This can&apos;t be undone.
              </div>
              <div className="pop-confirm-actions">
                <button className="pop-btn pop-btn-cancel" onClick={handleCancelConfirm}>
                  Cancel
                </button>
                <button className="pop-btn pop-btn-danger" onClick={handleConfirmRemove}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="pop-status-row" role="group" aria-label="Status">
                {STATUS_PILLS.map(({ key, label, cls }) => (
                  <button
                    key={key}
                    role="menuitemradio"
                    aria-checked={currentStatus === key}
                    className={`pop-status-opt ${cls}${isPopoverStatus(currentStatus) && currentStatus === key ? " active" : ""}`}
                    onClick={e => handleStatusChange(e, key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="pop-divider" />
              <button role="menuitem" className="pop-action" onClick={handleViewPrintings}>
                <span className="pop-action-icon pop-icon-blue">↗</span>
                View all printings
              </button>
              <div className="pop-divider" />
              <button role="menuitem" className="pop-action danger" onClick={handleRemoveClick}>
                <span className="pop-action-icon pop-icon-red">✕</span>
                Remove from deck
              </button>
            </>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        ref={btnRef}
        className={`row-overflow${open ? " active" : ""}`}
        aria-label={`Card actions for ${cardName}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={toggle}
      >
        ···
      </button>
      {popover}
    </>
  );
}
