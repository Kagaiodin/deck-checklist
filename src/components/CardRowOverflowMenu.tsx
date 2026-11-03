import { useState, useRef, useEffect, useCallback, useId } from "react";
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
  quantity?: number;
  isCommander?: boolean;
  commanderCapReached?: boolean;
  onToggleCommander?: (cardId: string) => void;
}

export function CardRowOverflowMenu({ cardId, cardName, currentStatus, onSetSource, onRemoveCard, quantity = 1, isCommander = false, commanderCapReached = false, onToggleCommander }: Props) {
  const [open, setOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [flipUp, setFlipUp] = useState(false);
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hintId = `cmdr-hint-${useId()}`;

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    setShowConfirm(false);
    if (returnFocus) btnRef.current?.focus();
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
        close(true);
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
    if (open) { close(true); return; }

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
    close(true);
    window.open(
      `https://scryfall.com/search?q=!"${encodeURIComponent(cardName)}"&unique=prints`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  const showCommanderAction = !!onToggleCommander && (isCommander || quantity === 1);
  const commanderBlocked = !isCommander && commanderCapReached;

  function handleCommanderClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (commanderBlocked) return;
    onToggleCommander?.(cardId);
    close(true);
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

  // Arrow-key navigation per the ARIA menu pattern: up/down across every item,
  // left/right within the status group.
  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (showConfirm) return;
    const keys = ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const root = popoverRef.current;
    if (!root) return;
    const target = e.target as HTMLElement;
    const inStatus = !!target.closest(".pop-status-row");
    const scope = e.key === "ArrowLeft" || e.key === "ArrowRight"
      ? (inStatus ? ".pop-status-row button" : null)
      : "button";
    if (!scope) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(scope))
      .filter(el => el.getAttribute("aria-disabled") !== "true");
    if (items.length === 0) return;
    e.preventDefault();
    const idx = items.indexOf(target);
    let next = idx;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (idx + 1) % items.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (idx - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    items[next].focus();
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
          onKeyDown={onMenuKeyDown}
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
              {showCommanderAction && (
                <button
                  role="menuitem"
                  className="pop-action"
                  aria-disabled={commanderBlocked || undefined}
                  aria-describedby={commanderBlocked ? hintId : undefined}
                  onClick={handleCommanderClick}
                >
                  <span className={`pop-action-icon ${commanderBlocked ? "pop-icon-locked" : "pop-icon-neutral"}`}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {commanderBlocked ? (
                        <><rect x="3.5" y="7" width="9" height="6.5" rx="1.2" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></>
                      ) : (
                        <><path d="M2 12.5h12M2.5 11 1.5 5l3.7 3L8 3.5 10.8 8l3.7-3-1 6z" />{isCommander && <path d="M2 2l12 12" />}</>
                      )}
                    </svg>
                  </span>
                  <span className="pop-action-text">
                    {isCommander ? "Remove commander" : "Set as commander"}
                    {commanderBlocked && <span className="pop-action-hint" id={hintId}>Remove a commander first</span>}
                  </span>
                </button>
              )}
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
