import { useState } from "react";
import type { Trade, TradeSettings } from "../../../types/trade";
import type { Fairness, SideTotals } from "../../../utils/tradePricing";
import { isSideEmpty } from "../../../utils/tradePricing";
import type { SideKey } from "../hooks/useTrade";
import { clampPct, relativeAge, usd } from "../format";
import { FairnessMeter } from "./FairnessMeter";
import { AlertIcon, LinkIcon, LockIcon, PlusIcon, RedoIcon, RefreshIcon, SwapIcon, TextIcon, TrashIcon, UndoIcon } from "./TradeIcons";

const STALE_AFTER_MS = 60 * 60_000;

interface ControlPanelProps {
  trade: Trade;
  mineTotals: SideTotals;
  theirTotals: SideTotals;
  fairness: Fairness;
  isNeutral: boolean;
  neutralText: string;
  missingPriceCount: number;
  /** Cards the last refresh couldn't reprice. */
  staleCount: number;
  refreshing: boolean;
  /** Oldest price snapshot on the trade; null when nothing is priced yet. */
  oldestPriceAt: number | null;
  /** When a shared trade was snapshotted; only set for read-only trades. */
  snapshotAt: number | null;
  canUndo: boolean;
  canRedo: boolean;
  /** "sheet" drops the card chrome so it can live inside the mobile bottom sheet. */
  variant?: "panel" | "sheet";
  onAddBalance: (side: SideKey, amount: number) => void;
  onAddCash: (side: SideKey) => void;
  onSetSettings: (patch: Partial<TradeSettings>) => void;
  onRefresh: () => void;
  onJumpToMissing: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSwap: () => void;
  onClear: () => void;
  onCopyText: () => void;
  onShare: () => void;
}

export function ControlPanel(p: ControlPanelProps) {
  const { trade } = p;
  const ro = trade.readOnly;
  const nothing = isSideEmpty(trade.mine) && isSideEmpty(trade.theirs);
  const anyCards = trade.mine.cards.length + trade.theirs.cards.length > 0;

  const sideOverrides = [trade.mine, trade.theirs].filter((s) => s.discountOverridePct !== undefined).length;
  const cardOverrides = [...trade.mine.cards, ...trade.theirs.cards].filter((c) => c.discountOverridePct !== undefined).length;
  const overrideText = [
    sideOverrides > 0 && `${sideOverrides} side${sideOverrides > 1 ? "s" : ""}`,
    cardOverrides > 0 && `${cardOverrides} card${cardOverrides > 1 ? "s" : ""}`,
  ].filter(Boolean).join(" · ");

  return (
    <aside className={`tr-ctrl${p.variant === "sheet" ? " tr-ctrl--sheet" : ""}`} aria-label="Trade controls">
      <div className="tr-ctrl-sec">
        <FairnessMeter
          fairness={p.fairness}
          isNeutral={p.isNeutral}
          tolerancePct={trade.settings.tolerancePct}
          neutralText={p.neutralText}
          onAddBalance={ro ? undefined : p.onAddBalance}
        />
      </div>

      <div className="tr-ctrl-sec">
        <div className="tr-totals">
          <Total who="Mine" totals={p.mineTotals} cards={trade.mine.cards.reduce((n, c) => n + c.quantity, 0)} testId="total-mine" />
          <div className="vs">VS</div>
          <Total who="Theirs" totals={p.theirTotals} cards={trade.theirs.cards.reduce((n, c) => n + c.quantity, 0)} testId="total-theirs" />
        </div>
        {!ro && (
          <div className="tr-cash-adds">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => p.onAddCash("mine")}><PlusIcon />Cash to mine</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => p.onAddCash("theirs")}><PlusIcon />Cash to theirs</button>
          </div>
        )}
      </div>

      <div className="tr-ctrl-sec">
        <Freshness {...p} anyCards={anyCards} />
        {p.missingPriceCount > 0 && (
          <div className="tr-warn-line">
            <AlertIcon size={14} />
            <span>{p.missingPriceCount} card{p.missingPriceCount > 1 ? "s have" : " has"} no price</span>
            {!ro && <button type="button" onClick={p.onJumpToMissing}>Jump to row</button>}
          </div>
        )}
      </div>

      {!ro && (
        <>
          <div className="tr-ctrl-sec">
            <div className="tr-set-row">
              <span className="lbl">
                Discount
                <small className={overrideText ? "override" : undefined}>
                  {overrideText ? `Overridden on ${overrideText}` : "off TCGplayer · sets the dollar terms"}
                </small>
              </span>
              <PctInput label="Global discount percent" value={trade.settings.discountPct} onCommit={(n) => p.onSetSettings({ discountPct: n })} />
            </div>
            <div className="tr-set-row">
              <span className="lbl">Fair within<small>tolerance for “Fair”</small></span>
              <PctInput label="Fairness tolerance percent" value={trade.settings.tolerancePct} onCommit={(n) => p.onSetSettings({ tolerancePct: n })} />
            </div>
          </div>

          <div className="tr-ctrl-sec">
            <div className="tr-label">
              <span>Edit</span>
              <span className="tr-undo-pair">
                <button type="button" className="tr-icon-btn" aria-label="Undo" disabled={!p.canUndo} onClick={p.onUndo}><UndoIcon /></button>
                <button type="button" className="tr-icon-btn" aria-label="Redo" disabled={!p.canRedo} onClick={p.onRedo}><RedoIcon /></button>
              </span>
            </div>
            <div className="tr-tool-grid">
              <button type="button" className="btn btn-secondary btn-sm" disabled={nothing} onClick={p.onSwap}><SwapIcon />Swap sides</button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={nothing} onClick={p.onClear}><TrashIcon />Clear trade</button>
            </div>
          </div>
        </>
      )}

      <div className="tr-ctrl-sec">
        <div className="tr-share-row">
          <button type="button" className={`btn btn-secondary${ro ? " btn-block" : ""}`} disabled={nothing} title="Plain-text summary for Discord / chat" onClick={p.onCopyText}>
            <TextIcon />Copy as text
          </button>
          {!ro && (
            <button type="button" className="btn btn-primary" disabled={nothing} onClick={p.onShare}><LinkIcon />Share link</button>
          )}
        </div>
      </div>
    </aside>
  );
}

function Total({ who, totals, cards, testId }: { who: string; totals: SideTotals; cards: number; testId: string }) {
  return (
    <div>
      <div className="who">{who}</div>
      <div className="amt" data-testid={testId}>{usd(totals.total)}</div>
      <div className="sub">{totals.cashTotal > 0 ? `incl. ${usd(totals.cashTotal)} cash` : `${cards} card${cards === 1 ? "" : "s"}`}</div>
    </div>
  );
}

function Freshness(p: ControlPanelProps & { anyCards: boolean }) {
  if (p.trade.readOnly) {
    return (
      <div className="tr-fresh">
        <LockIcon size={14} />
        <span>Snapshot · prices as of {p.snapshotAt ? new Date(p.snapshotAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "unknown"}</span>
      </div>
    );
  }
  if (p.refreshing) {
    return (
      <div className="tr-fresh tr-fresh--loading">
        <span className="dot" />
        <span>Refreshing prices…</span>
        <span className="tr-spacer" />
        <button type="button" className="btn btn-secondary btn-sm" disabled><span className="tr-spin" style={{ display: "inline-flex" }}><RefreshIcon /></span>Refreshing</button>
      </div>
    );
  }
  if (!p.anyCards) {
    return (
      <div className="tr-fresh tr-fresh--idle">
        <span className="dot" />
        <span>Prices load as you add cards</span>
      </div>
    );
  }
  const stale = p.oldestPriceAt !== null && Date.now() - p.oldestPriceAt > STALE_AFTER_MS;
  const failed = p.staleCount > 0;
  return (
    <div className={`tr-fresh${stale || failed ? " tr-fresh--stale" : ""}`}>
      <span className="dot" />
      <span>
        {failed
          ? `${p.staleCount} card${p.staleCount > 1 ? "s" : ""} couldn't refresh · showing last price`
          : p.oldestPriceAt === null ? "No price snapshot" : `Updated ${relativeAge(p.oldestPriceAt)}`}
      </span>
      <span className="tr-spacer" />
      <button type="button" className="btn btn-secondary btn-sm" onClick={p.onRefresh}><RefreshIcon />{failed ? "Retry" : "Refresh prices"}</button>
    </div>
  );
}

function PctInput({ label, value, onCommit }: { label: string; value: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const n = parseFloat(draft ?? "");
    setDraft(null);
    if (Number.isFinite(n) && clampPct(n) !== value) onCommit(clampPct(n));
  };
  return (
    <span className="tr-pct-field">
      <input
        inputMode="decimal"
        aria-label={label}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      />
      <span>%</span>
    </span>
  );
}
