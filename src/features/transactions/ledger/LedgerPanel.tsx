import { useState } from "react";
import type { TradeLogCard, TradeLogEntry } from "../../../types/trade";
import { EmptyState } from "../../../components/EmptyState";
import { TradeSheet } from "../../trade/components/TradeSheet";
import { usd } from "../../trade/format";
import "./LedgerPanel.css";

interface LedgerPanelProps {
  entries: TradeLogEntry[];
  /** Id to show in detail, set when arriving from the "Logged" toast. */
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  onNewTrade: () => void;
  onDelete: (id: string) => void;
}

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const count = (cards: TradeLogCard[]) => cards.reduce((n, c) => n + c.quantity, 0);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const FINISH: Record<string, string> = { nonfoil: "", foil: " Foil", etched: " Etched" };

function summary(e: TradeLogEntry): string {
  const out = count(e.cardsOut), inn = count(e.cardsIn);
  const parts = [`${plural(out, "card")} out`];
  if (inn > 0) parts.push(`${plural(inn, "card")} in`);
  if (e.cash.out > 0) parts.push(`${usd(e.cash.out)} cash out`);
  if (e.cash.in > 0) parts.push(`${usd(e.cash.in)} cash in`);
  return parts.join(" · ");
}

export function LedgerPanel({ entries, openId, onOpenChange, onNewTrade, onDelete }: LedgerPanelProps) {
  const [confirming, setConfirming] = useState(false);
  const open = openId ? entries.find(e => e.id === openId) ?? null : null;

  if (open) {
    const title = open.counterparty ? `Trade with ${open.counterparty}` : "Trade";
    return (
      <div className="ledger-detail">
        <button type="button" className="btn btn-ghost btn-sm ledger-back" onClick={() => onOpenChange(null)}>← Trades &amp; sales</button>
        <h2 className="ledger-title">{title}</h2>
        <p className="ledger-sub">{fmtDate(open.date)}{open.notes ? ` · ${open.notes}` : ""}</p>
        <DetailSide heading="You gave" cards={open.cardsOut} cash={open.cash.out} total={open.totals.out} />
        <DetailSide heading="You received" cards={open.cardsIn} cash={open.cash.in} total={open.totals.in} />
        <p className="ledger-foot">To correct a mistake, delete and re-log.</p>
        <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)}>Delete entry</button>
        {confirming && (
          <TradeSheet
            title="Delete this entry?"
            onClose={() => setConfirming(false)}
            footer={
              <>
                <span className="tr-spacer" />
                <button type="button" className="btn btn-secondary" data-autofocus onClick={() => setConfirming(false)}>Cancel</button>
                <button type="button" className="btn tr-btn-destructive" onClick={() => { setConfirming(false); onOpenChange(null); onDelete(open.id); }}>Delete entry</button>
              </>
            }
          >
            <div className="tr-dialog">
              <p>Your Collection will not change back. Cards you gave stay out and cards you received stay in. Fix quantities in Collection if you need to.</p>
            </div>
          </TradeSheet>
        )}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 7h12l-3-3M17 17H5l3 3" />
          </svg>
        }
        title="No trades yet"
        body="Trades and sales you log will appear here."
        primary={{ label: "New trade", onClick: onNewTrade }}
      />
    );
  }

  return (
    <ul className="ledger-list">
      {entries.map(e => (
        <li key={e.id}>
          <button type="button" className="ledger-row" onClick={() => onOpenChange(e.id)}>
            <span className="ledger-row-main">
              <span className="ledger-row-name">{e.counterparty || "Trade"}</span>
              <span className="ledger-row-sub">{fmtDate(e.date)} · {summary(e)}</span>
            </span>
            <span className="ledger-row-total">{usd(e.totals.out)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function DetailSide({ heading, cards, cash, total }: { heading: string; cards: TradeLogCard[]; cash: number; total: number }) {
  return (
    <section className="ledger-side" aria-label={heading}>
      <h3>{heading} <span className="ledger-side-total">{usd(total)}</span></h3>
      <ul>
        {cards.length === 0 && cash === 0 && <li className="ledger-none">Nothing</li>}
        {cards.map((c, i) => (
          <li key={i}>
            <span>{c.quantity}× {c.name} <span className="ledger-meta">({c.set.toUpperCase()} {c.collectorNumber}{FINISH[c.finish]}, {c.condition})</span></span>
            <span>{c.unitPrice === null ? "no price" : usd(c.unitPrice * c.quantity)}</span>
          </li>
        ))}
        {cash > 0 && <li><span>Cash</span><span>{usd(cash)}</span></li>}
      </ul>
    </section>
  );
}
