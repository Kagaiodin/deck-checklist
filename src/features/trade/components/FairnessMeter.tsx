import type { Fairness } from "../../../utils/tradePricing";
import type { SideKey } from "../hooks/useTrade";
import { usd } from "../format";
import { AlertIcon, CashIcon, CheckIcon, ScaleIcon, TiltIcon } from "./TradeIcons";

interface FairnessMeterProps {
  fairness: Fairness;
  /** True until both sides have something on them: no verdict is shown. */
  isNeutral: boolean;
  tolerancePct: number;
  /** Copy for the neutral state; the page points it at whichever side is missing. */
  neutralText?: string;
  compact?: boolean;
  /** Omit when the trade is read-only: hides the "add cash" suggestion. */
  onAddBalance?: (side: SideKey, amount: number) => void;
}

const BAND_LABEL = { fair: "Fair", leaning: "Leaning", lopsided: "Lopsided" } as const;
const BAND_ICON = { fair: CheckIcon, leaning: TiltIcon, lopsided: AlertIcon } as const;

// A delta of p% puts My share of the combined value at (1 − p/100) / (2 − p/100).
const zoneEdge = (pct: number) => {
  const p = Math.min(pct, 99) / 100;
  return `${(((1 - p) / (2 - p)) * 100).toFixed(2)}%`;
};

export function FairnessMeter({
  fairness: f,
  isNeutral,
  tolerancePct,
  neutralText = "Add cards to both sides to compare",
  compact = false,
  onAddBalance,
}: FairnessMeterProps) {
  const band = isNeutral ? "empty" : f.band;
  const leanMax = Math.max(25, tolerancePct + 15);
  // Share of combined value on My side, recovered from the fairness numbers alone.
  const share = isNeutral || f.favors === "even" ? 50 : shareFrom(f);
  const clamped = Math.max(3, Math.min(97, share));

  const who = f.favors === "them" ? "them" : "you";
  const label = isNeutral ? "Add cards" : BAND_LABEL[f.band];
  const Icon = isNeutral ? ScaleIcon : BAND_ICON[f.band];
  const valueText = isNeutral
    ? "No comparison yet — add cards to both sides."
    : `${label}. ${f.favors === "even" ? "Even trade." : `Favors ${who} by ${usd(f.balanceHint)}, ${f.deltaPct.toFixed(1)} percent.`}`;

  const shortSide: SideKey = f.favors === "them" ? "theirs" : "mine";

  return (
    <div
      className={`tr-meter${compact ? " tr-meter--compact" : ""}`}
      data-band={band}
      style={{ "--share": `${clamped.toFixed(2)}%` } as React.CSSProperties}
    >
      {!compact && (
        <div className="tr-meter-sides" aria-hidden="true">
          <span>My offer</span>
          <span>Their offer</span>
        </div>
      )}
      <div
        className="tr-meter-track"
        role="meter"
        aria-label="Trade fairness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share)}
        aria-valuetext={valueText}
      >
        <div className="tr-meter-zone tr-meter-zone--lean" style={{ left: zoneEdge(leanMax), right: zoneEdge(leanMax) }} />
        <div className="tr-meter-zone tr-meter-zone--fair" style={{ left: zoneEdge(tolerancePct), right: zoneEdge(tolerancePct) }} />
        <div className="tr-meter-fill" />
        <div className="tr-meter-center" />
        <div className="tr-meter-marker" />
      </div>

      <div className="tr-meter-verdict">
        <span className="tr-band-pill" key={band}>
          <Icon />
          {label}
        </span>
        <span className="tr-meter-favors">
          {isNeutral ? neutralText : f.favors === "even" ? <b>Dead even</b> : <>favors <b>{who}</b></>}
        </span>
      </div>

      {!compact && !isNeutral && f.favors !== "even" && (
        <p className="tr-meter-delta">
          {f.favors === "them" ? "You give" : "They give"} <span className="tr-mono">{usd(f.balanceHint)}</span> more ·{" "}
          <span className="tr-mono">{f.deltaPct.toFixed(1)}%</span>
        </p>
      )}
      {!compact && !isNeutral && f.favors === "even" && <p className="tr-meter-delta">No difference</p>}

      {!compact && !isNeutral && f.band !== "fair" && f.favors !== "even" && (
        <div className="tr-meter-hint">
          <span>
            Add <b className="tr-mono">{usd(f.balanceHint)}</b> to {shortSide === "theirs" ? "Their" : "My"} side to even it out
          </span>
          {onAddBalance && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAddBalance(shortSide, Math.round(f.balanceHint * 100) / 100)}>
              <CashIcon />
              Add cash line
            </button>
          )}
        </div>
      )}

      <div className="tr-sr-only" role="status" aria-live="polite">{valueText}</div>
    </div>
  );
}

/** mine/(mine+theirs) × 100 from the sign and size of the imbalance (deltaPct = |delta| / max). */
function shareFrom(f: Fairness): number {
  const p = f.deltaPct / 100; // |delta| / max
  // If I give more (delta > 0): mine = max, theirs = max(1 − p) → share = 1 / (2 − p).
  // If they give more: theirs = max, mine = max(1 − p) → share = (1 − p) / (2 − p).
  return (f.delta > 0 ? 1 / (2 - p) : (1 - p) / (2 - p)) * 100;
}
