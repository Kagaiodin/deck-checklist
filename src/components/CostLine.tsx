import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Card } from "../types/index";
import { computeCostToComplete, describePricesAge, formatCostAmount } from "../utils/deckCost";
import type { CostToComplete } from "../utils/deckCost";

const HOVER_OPEN_MS = 150;
const HOVER_CLOSE_MS = 150;

const WARN_ICON = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d="M8 2 1.5 13.5h13z" />
    <path d="M8 6.5v3.2M8 11.6v.2" />
  </svg>
);

function canHover(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(hover: hover)").matches;
}

interface PopoverProps {
  id: string;
  cost: CostToComplete;
  age: { label: string; stale: boolean } | null;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

function BreakdownPopover({ id, cost, age, onPointerEnter, onPointerLeave }: PopoverProps) {
  // The two rows must add up to the headline, so derive the untagged figure from the rounded total.
  const bothRows = cost.toBuyCount > 0 && cost.untaggedCount > 0 && cost.remaining >= 1;
  const toBuyAmt = bothRows ? Math.round(cost.toBuyCost) : cost.toBuyCost;
  const untaggedAmt = bothRows ? Math.round(cost.remaining) - Math.round(cost.toBuyCost) : cost.untaggedCost;
  const noun = cost.missingCount === 1 ? "card" : "cards";

  return (
    <div className="cost-pop" id={id} role="dialog" aria-label="Cost to finish breakdown" onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      <div className="cost-pop-head">
        <div className="cost-pop-total">
          <span className="cost-amt">{formatCostAmount(cost.remaining)}</span>
          <span className="cost-lead">to finish</span>
        </div>
        <div className="cost-pop-sub">{cost.missingCount} {noun} still missing</div>
      </div>
      <div className="cost-pop-divider" />
      <dl className="cost-pop-rows">
        {cost.toBuyCount > 0 && (<><dt>To buy<span className="n">{cost.toBuyCount}</span></dt><dd>{formatCostAmount(toBuyAmt)}</dd></>)}
        {cost.untaggedCount > 0 && (<><dt>Untagged<span className="n">{cost.untaggedCount}</span></dt><dd>{formatCostAmount(untaggedAmt)}</dd></>)}
      </dl>
      {(cost.unpricedCount > 0 || cost.orderedCount > 0) && (
        <>
          <div className="cost-pop-divider" />
          <dl className="cost-pop-rows">
            {cost.unpricedCount > 0 && (<><dt>No price found<span className="n">{cost.unpricedCount}</span></dt><dd className="note">counted as $0</dd></>)}
            {cost.orderedCount > 0 && (<><dt>Ordered<span className="n">{cost.orderedCount}</span></dt><dd className="note">not counted</dd></>)}
          </dl>
        </>
      )}
      <div className="cost-pop-divider" />
      <div className="cost-pop-foot">
        <span>Estimated from Scryfall's default printing, in USD</span>
        {age && (age.stale ? (
          <span className="cost-stale">{WARN_ICON}Couldn't refresh. {age.label}.</span>
        ) : (
          <span>{age.label}</span>
        ))}
      </div>
    </div>
  );
}

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
  const [open, setOpen] = useState(false);
  const pinned = useRef(false); // opened by click/Enter, so pointer-leave must not close it
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popId = useId();

  const clearTimer = () => { clearTimeout(hoverTimer.current); hoverTimer.current = undefined; };
  const close = useCallback((returnFocus: boolean) => {
    clearTimeout(hoverTimer.current);
    pinned.current = false;
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(true); };
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open, close]);

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

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

  const onTriggerClick = () => {
    clearTimer();
    if (open && pinned.current) { close(false); return; }
    pinned.current = true; // a click on a hover-opened popover pins it
    setOpen(true);
  };
  const onPointerEnter = () => {
    if (!canHover()) return;
    clearTimer();
    if (!open) hoverTimer.current = setTimeout(() => setOpen(true), HOVER_OPEN_MS);
  };
  const onPointerLeave = () => {
    if (!canHover()) return;
    clearTimer();
    if (open && !pinned.current) hoverTimer.current = setTimeout(() => close(false), HOVER_CLOSE_MS);
  };

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
    <div className="cost-line" ref={rootRef}>
      <span>
        <button
          ref={triggerRef}
          type="button"
          className="cost-trigger"
          aria-expanded={open}
          aria-controls={open ? popId : undefined}
          aria-haspopup="dialog"
          onClick={onTriggerClick}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
        >
          <span className="cost-amt">{formatCostAmount(cost.remaining)}</span>
        </button>{" "}
        <span className="cost-lead">to finish</span>
      </span>
      {separated}
      {open && <BreakdownPopover id={popId} cost={cost} age={age} onPointerEnter={clearTimer} onPointerLeave={onPointerLeave} />}
    </div>
  );
}
