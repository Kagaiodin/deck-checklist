import { useState } from "react";
import { VENDORS } from "./useBuyFlow";
import "./buy-flow.css";

function formatLastUsed(ts: number | undefined): string {
  if (!ts) return "Never used";
  const diff = Date.now() - ts;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Last used today";
  if (days === 1) return "Last used yesterday";
  if (days < 30) return `Last used ${days} days ago`;
  const months = Math.floor(days / 30);
  return `Last used ${months} month${months !== 1 ? "s" : ""} ago`;
}

interface Props {
  initialVendorId: string | null;
  vendorLastUsed: Record<string, number>;
  cardCount: number;
  onContinue: (vendorId: string) => void;
  onBack: () => void;
}

export function VendorPicker({
  initialVendorId,
  vendorLastUsed,
  cardCount,
  onContinue,
  onBack,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>(
    initialVendorId ?? VENDORS[0].id
  );

  return (
    <>
      {/* Header */}
      <div className="buy-sheet-handle" />
      <div className="buy-sheet-header">
        <div>
          <div className="buy-sheet-title">Choose vendor</div>
          <div className="buy-sheet-meta">{cardCount} card{cardCount !== 1 ? "s" : ""}</div>
        </div>
        <button className="buy-sheet-close" onClick={onBack} aria-label="Back">
          ←
        </button>
      </div>

      {/* Vendor options */}
      <div className="buy-sheet-body">
        <div className="buy-picker-options">
          {VENDORS.map(v => (
            <button
              key={v.id}
              className={`buy-picker-option${selectedId === v.id ? " selected" : ""}`}
              onClick={() => setSelectedId(v.id)}
            >
              <div className="buy-picker-radio" />
              <div className="buy-picker-option-info">
                <div className="buy-picker-option-name">{v.label}</div>
                <div className="buy-picker-option-desc">{v.sendMethodDesc}</div>
              </div>
              <div className="buy-picker-option-last">
                {formatLastUsed(vendorLastUsed[v.id])}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="buy-sheet-footer">
        <button
          className="buy-sheet-btn buy-sheet-btn-accent"
          onClick={() => onContinue(selectedId)}
        >
          Continue
        </button>
      </div>
    </>
  );
}
