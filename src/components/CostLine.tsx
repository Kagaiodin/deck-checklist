import { useState } from "react";
import type { ReactNode } from "react";
import type { Card } from "../types/index";
import { computeCostToComplete, describePricesAge, formatCostAmount } from "../utils/deckCost";

interface Props {
  cards: Card[];
  pricesUpdatedAt?: number;
  isLoading: boolean;
  now?: number;
}

// Prices the acquisition gap only. Never render an owned-side or whole-deck dollar figure.
export function CostLine({ cards, pricesUpdatedAt, isLoading, now: nowOverride }: Props) {
  // Captured once at mount: freshness only needs a stale-vs-fresh call, and a refresh that
  // lands later has a newer timestamp than this, so it still reads as fresh.
  const [mountedAt] = useState(() => Date.now());
  const now = nowOverride ?? mountedAt;
  if (cards.length === 0) return null;
  const cost = computeCostToComplete(cards);

  const notes: ReactNode[] = [];
  if (cost.unpricedCount > 0) notes.push(`+${cost.unpricedCount} unpriced`);
  if (cost.orderedCount > 0) notes.push(`${cost.orderedCount} ordered`);

  const age = pricesUpdatedAt !== undefined && cost.pricedCount > 0 ? describePricesAge(pricesUpdatedAt, now) : null;
  if (age) {
    notes.push(
      age.stale ? (
        <span className="cost-stale">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="M8 2 1.5 13.5h13z" />
            <path d="M8 6.5v3.2M8 11.6v.2" />
          </svg>
          {age.label}
        </span>
      ) : age.label
    );
  }

  const separated = notes.map((note, i) => (
    <span key={i} className="cost-meta">
      {i > 0 && <span className="cost-sep" aria-hidden="true"> · </span>}
      {note}
    </span>
  ));

  if (cost.missingCount === 0) {
    return (
      <div className="cost-line">
        <span className="cost-done">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="m3 8.5 3 3 7-7" />
          </svg>
          Nothing left to buy
        </span>
        {separated}
      </div>
    );
  }

  if (cost.pricedCount === 0) {
    return isLoading ? (
      <div className="cost-line">
        <span className="cost-loading" role="status">Loading prices…</span>
      </div>
    ) : null;
  }

  return (
    <div className="cost-line">
      <span>
        <span className="cost-amt">{formatCostAmount(cost.remaining)}</span>{" "}
        <span className="cost-lead">to finish</span>
      </span>
      {separated}
    </div>
  );
}
