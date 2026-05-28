import { useEffect, useRef } from "react";
import type { Card } from "../../types/index";
import { VENDORS } from "./useBuyFlow";
import type { SendState, ErrorType } from "./useBuyFlow";
import { VendorPicker } from "./VendorPicker";
import "./buy-flow.css";

function formatLastUsed(ts: number | undefined): string {
  if (!ts) return "Last used today"; // just sent → freshly persisted
  const diff = Date.now() - ts;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Last used today";
  if (days === 1) return "Last used yesterday";
  if (days < 30) return `Last used ${days} days ago`;
  const months = Math.floor(days / 30);
  return `Last used ${months} month${months !== 1 ? "s" : ""} ago`;
}

interface Props {
  isOpen: boolean;
  cards: Card[];
  selectedVendorId: string | null;
  vendorPickerOpen: boolean;
  vendorLastUsed: Record<string, number>;
  sendState: SendState;
  errorType: ErrorType | null;
  sendUrl: string | null;
  clipboardText: string | null;
  createdOrderId: string | null;
  onClose: () => void;
  onOpenVendorPicker: () => void;
  onCloseVendorPicker: () => void;
  onConfirmVendor: (vendorId: string) => void;
  onSend: (vendorId: string) => void;
  onRetrySend: (vendorId: string) => void;
  onViewOrder: () => void;
}

export function BuyListSheet({
  isOpen,
  cards,
  selectedVendorId,
  vendorPickerOpen,
  vendorLastUsed,
  sendState,
  errorType,
  sendUrl,
  clipboardText,
  createdOrderId,
  onClose,
  onOpenVendorPicker,
  onCloseVendorPicker,
  onConfirmVendor,
  onSend,
  onRetrySend,
  onViewOrder,
}: Props) {
  const manualTextRef = useRef<HTMLTextAreaElement>(null);

  // Dismiss the entire flow on Escape regardless of which sub-view is active.
  // Intentionally calls onClose (not onCloseVendorPicker) so Escape fully
  // closes rather than stepping back one level.
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  // Pre-select the manual fallback textarea when clipboard is denied
  useEffect(() => {
    if (errorType === "clipboard-denied" && manualTextRef.current) {
      manualTextRef.current.focus();
      manualTextRef.current.select();
    }
  }, [errorType]);

  if (!isOpen) return null;

  const vendor = VENDORS.find(v => v.id === selectedVendorId) ?? null;
  const isSending = sendState === "sending";
  const cardCount = cards.reduce((s, c) => s + c.quantity, 0);

  // ── Vendor picker sub-view ──────────────────────────────────────────────────
  if (vendorPickerOpen) {
    return (
      <div className="buy-sheet-backdrop" onClick={onCloseVendorPicker}>
        <div className="buy-sheet" role="dialog" aria-modal="true" aria-label="Choose vendor" onClick={e => e.stopPropagation()}>
          <VendorPicker
            initialVendorId={selectedVendorId}
            vendorLastUsed={vendorLastUsed}
            cardCount={cardCount}
            onContinue={onConfirmVendor}
            onBack={onCloseVendorPicker}
          />
        </div>
      </div>
    );
  }

  // ── Success view ────────────────────────────────────────────────────────────
  if (sendState === "success" && vendor) {
    const isClipboard = !vendor.prefill;
    const clipPreview = cards.map(c => `${c.quantity} ${c.name}`).join("\n");

    return (
      <div className="buy-sheet-backdrop" onClick={onClose}>
        <div className="buy-sheet" role="dialog" aria-modal="true" aria-label="Send complete" onClick={e => e.stopPropagation()}>
          <div className="buy-sheet-handle" />
          <div className="buy-sheet-header">
            <div>
              <div className="buy-sheet-title">Buy list</div>
            </div>
            <button className="buy-sheet-close" onClick={onClose} aria-label="Close">×</button>
          </div>

          <div className="buy-sheet-body">
            <div className="buy-success-view">
              <div className="buy-success-icon" aria-hidden="true">✓</div>
              <div className="buy-success-title">
                {isClipboard ? "Copied to clipboard" : `Sent to ${vendor.label}`}
              </div>
              <div className="buy-success-sub">
                {isClipboard
                  ? vendor.url
                    ? `${cardCount} cards in ${vendor.label} format`
                    : `${cardCount} card${cardCount !== 1 ? "s" : ""} — paste in any site`
                  : `Tab opened with ${cardCount} cards pre-filled`}
              </div>

              {isClipboard && (
                <div className="buy-clip-preview" aria-label="Copied card list preview">
                  {clipPreview}
                </div>
              )}

              {createdOrderId && (
                <div className="buy-order-block">
                  <div className="buy-order-eyebrow">Order draft created</div>
                  <div className="buy-order-title">{vendor.label}</div>
                  <div className="buy-order-meta">
                    {cardCount} card{cardCount !== 1 ? "s" : ""} · {new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · Active
                  </div>
                  <div className="buy-order-meta" style={{ marginTop: 4 }}>
                    Add tracking number when it ships
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="buy-sheet-footer">
            {createdOrderId && (
              <button className="buy-sheet-btn buy-sheet-btn-accent" onClick={() => { onViewOrder(); onClose(); }}>
                View order
              </button>
            )}
            {isClipboard && vendor.url && (
              <button
                className="buy-sheet-btn buy-sheet-btn-ghost"
                onClick={() => window.open(vendor.url, "_blank")}
              >
                Open {vendor.label} →
              </button>
            )}
            <button className="buy-sheet-btn buy-sheet-btn-ghost" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Error view ──────────────────────────────────────────────────────────────
  if (sendState === "error") {
    if (errorType === "popup-blocked" && vendor) {
      return (
        <div className="buy-sheet-backdrop" onClick={onClose}>
          <div className="buy-sheet" role="dialog" aria-modal="true" aria-label="Popup blocked" onClick={e => e.stopPropagation()}>
            <div className="buy-sheet-handle" />
            <div className="buy-sheet-header">
              <div><div className="buy-sheet-title">Buy list</div></div>
              <button className="buy-sheet-close" onClick={onClose} aria-label="Close">×</button>
            </div>
            <div className="buy-sheet-body">
              <div className="buy-error-view">
                <div className="buy-warn-icon" aria-hidden="true">⚠</div>
                <div className="buy-error-title">{vendor.label} tab was blocked</div>
                <div className="buy-error-sub">
                  Your browser blocked the new tab. Open it manually — your list is in the URL.
                </div>
                {sendUrl && (
                  <div style={{ width: "100%", marginTop: 16 }}>
                    <button
                      className="buy-sheet-btn buy-sheet-btn-send"
                      onClick={() => window.open(sendUrl, "_blank")}
                    >
                      Open {vendor.label} →
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="buy-sheet-footer">
              <button className="buy-sheet-btn buy-sheet-btn-ghost" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (errorType === "clipboard-denied" && vendor) {
      return (
        <div className="buy-sheet-backdrop" onClick={onClose}>
          <div className="buy-sheet" role="dialog" aria-modal="true" aria-label="Clipboard error" onClick={e => e.stopPropagation()}>
            <div className="buy-sheet-handle" />
            <div className="buy-sheet-header">
              <div><div className="buy-sheet-title">Buy list</div></div>
              <button className="buy-sheet-close" onClick={onClose} aria-label="Close">×</button>
            </div>
            <div className="buy-sheet-body">
              <div className="buy-error-view">
                <div className="buy-warn-icon" aria-hidden="true">⚠</div>
                <div className="buy-error-title">Couldn't copy to clipboard</div>
                <div className="buy-error-sub">Browser denied access. Copy the list manually:</div>
                <textarea
                  ref={manualTextRef}
                  className="buy-manual-text"
                  readOnly
                  value={clipboardText ?? ""}
                  aria-label="Card list to copy manually"
                />
              </div>
            </div>
            <div className="buy-sheet-footer">
              <button
                className="buy-sheet-btn buy-sheet-btn-warn"
                onClick={() => onRetrySend(vendor.id)}
              >
                Retry clipboard copy
              </button>
              <button className="buy-sheet-btn buy-sheet-btn-ghost" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (cards.length === 0) {
    return (
      <div className="buy-sheet-backdrop" onClick={onClose}>
        <div className="buy-sheet" role="dialog" aria-modal="true" aria-label="Buy list" onClick={e => e.stopPropagation()}>
          <div className="buy-sheet-handle" />
          <div className="buy-sheet-header">
            <div>
              <div className="buy-sheet-title">Buy list</div>
              <div className="buy-sheet-meta">0 cards</div>
            </div>
            <button className="buy-sheet-close" onClick={onClose} aria-label="Close">×</button>
          </div>
          <div className="buy-sheet-body">
            <div className="buy-empty-view">
              <div className="buy-empty-icon" aria-hidden="true">🛒</div>
              <div className="buy-empty-title">Buy list is empty</div>
              <div className="buy-empty-sub">
                Tag cards "Need to buy" in your checklist and they'll appear here.
              </div>
            </div>
          </div>
          <div className="buy-sheet-footer">
            <button className="buy-sheet-btn buy-sheet-btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main view ───────────────────────────────────────────────────────────────
  const hasVendorHistory = selectedVendorId !== null;

  return (
    <div className="buy-sheet-backdrop" onClick={onClose}>
      <div className="buy-sheet" role="dialog" aria-modal="true" aria-label="Buy list" onClick={e => e.stopPropagation()}>
        <div className="buy-sheet-handle" />
        <div className="buy-sheet-header">
          <div>
            <div className="buy-sheet-title">Buy list</div>
            <div className="buy-sheet-meta">{cardCount} card{cardCount !== 1 ? "s" : ""}</div>
          </div>
          <button className="buy-sheet-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Scrollable card list */}
        <div className="buy-sheet-body">
          <div className="buy-card-list">
            {cards.map(card => (
              <div key={card.id} className="buy-card-row">
                <span className="buy-card-qty">{card.quantity}</span>
                <span className="buy-card-name">{card.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer — vendor + CTA */}
        <div className="buy-sheet-footer">
          {hasVendorHistory && vendor ? (
            <>
              <div className="buy-vendor-row">
                <div className="buy-vendor-avatar" aria-hidden="true">{vendor.emoji}</div>
                <div className="buy-vendor-info">
                  <div className="buy-vendor-name">{vendor.label}</div>
                  <div className="buy-vendor-last">
                    {formatLastUsed(vendorLastUsed[vendor.id])}
                  </div>
                </div>
                <button
                  className="buy-vendor-change"
                  onClick={onOpenVendorPicker}
                  disabled={isSending}
                >
                  Change
                </button>
              </div>
              <button
                className="buy-sheet-btn buy-sheet-btn-send"
                onClick={() => onSend(vendor.id)}
                disabled={isSending}
                aria-busy={isSending}
              >
                {isSending ? (
                  <>
                    <span className="buy-spinner" aria-hidden="true" />
                    {vendor.prefill ? `Sending to ${vendor.label}…` : "Copying to clipboard…"}
                  </>
                ) : (
                  `Send to ${vendor.label} (${cardCount})`
                )}
              </button>
            </>
          ) : (
            /* First use — no vendor history */
            <>
              <button
                className="buy-sheet-btn buy-sheet-btn-accent"
                onClick={onOpenVendorPicker}
              >
                Choose vendor to send →
              </button>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginTop: 10 }}>
                Manapool · TCGPlayer · Card Kingdom
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
