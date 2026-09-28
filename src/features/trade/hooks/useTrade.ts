import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  CONDITIONS,
  type CashLine,
  type Condition,
  type Trade,
  type TradeCard,
  type TradeSettings,
  type TradeSide,
} from "../../../types/trade";
import { basePriceFor, fairness, isSideEmpty, sideTotals } from "../../../utils/tradePricing";
import { fetchPrices, priceKey } from "../../../utils/scryfallSearch";
import type { Printing } from "../../../utils/scryfallSearch";

export const TRADE_STORAGE_KEY = "fetchlist-trade";
const HISTORY_LIMIT = 50;

export type SideKey = "mine" | "theirs";

const emptySide = (): TradeSide => ({ cards: [], cash: [] });
export const emptyTrade = (): Trade => ({
  mine: emptySide(),
  theirs: emptySide(),
  settings: { ...DEFAULT_SETTINGS },
  readOnly: false,
});

const newId = () => crypto.randomUUID();

// ── Persistence ───────────────────────────────────────────────────────────────

const isSide = (s: unknown): s is TradeSide =>
  !!s && typeof s === "object" && Array.isArray((s as TradeSide).cards) && Array.isArray((s as TradeSide).cash);

/** Reads the saved local trade. Anything unreadable falls back to an empty trade. */
export function loadLocalTrade(): Trade {
  try {
    const raw = window.localStorage.getItem(TRADE_STORAGE_KEY);
    if (!raw) return emptyTrade();
    const p = JSON.parse(raw) as Partial<Trade>;
    if (!isSide(p.mine) || !isSide(p.theirs)) return emptyTrade();
    return {
      mine: p.mine,
      theirs: p.theirs,
      settings: {
        discountPct: Number.isFinite(p.settings?.discountPct) ? p.settings!.discountPct : DEFAULT_SETTINGS.discountPct,
        tolerancePct: Number.isFinite(p.settings?.tolerancePct) ? p.settings!.tolerancePct : DEFAULT_SETTINGS.tolerancePct,
      },
      readOnly: false,
    };
  } catch {
    return emptyTrade();
  }
}

function saveLocalTrade(trade: Trade) {
  try {
    const { mine, theirs, settings } = trade;
    window.localStorage.setItem(TRADE_STORAGE_KEY, JSON.stringify({ mine, theirs, settings }));
  } catch {
    // quota exceeded — ignore
  }
}

// ── Reducer ───────────────────────────────────────────────────────────────────

interface State {
  trade: Trade;
  past: Trade[];
  future: Trade[];
}

type Action =
  | { type: "addCard"; side: SideKey; card: Omit<TradeCard, "id"> }
  | { type: "removeCard"; side: SideKey; id: string }
  | { type: "updateCard"; side: SideKey; id: string; patch: Partial<Omit<TradeCard, "id">> }
  | { type: "setSideCondition"; side: SideKey; condition: Condition }
  | { type: "addCash"; side: SideKey; amount: number }
  | { type: "updateCash"; side: SideKey; id: string; amount: number }
  | { type: "removeCash"; side: SideKey; id: string }
  | { type: "setSettings"; patch: Partial<TradeSettings> }
  | { type: "setSideDiscount"; side: SideKey; pct: number | undefined }
  | { type: "swap" }
  | { type: "clear" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "open"; trade: Trade }
  | { type: "fork"; previous: Trade }
  | { type: "applyPrices"; prices: Map<string, Printing>; at: number };

const sameLine = (a: Omit<TradeCard, "id">, b: TradeCard) =>
  a.set.toLowerCase() === b.set.toLowerCase() &&
  a.collectorNumber === b.collectorNumber &&
  a.name === b.name &&
  a.finish === b.finish &&
  a.condition === b.condition &&
  a.manualPrice === b.manualPrice &&
  a.discountOverridePct === b.discountOverridePct;

function editSide(trade: Trade, side: SideKey, fn: (s: TradeSide) => TradeSide): Trade {
  return { ...trade, [side]: fn(trade[side]) };
}

/** Applies an edit and records the previous trade for undo. No-ops on read-only trades. */
function commit(state: State, next: Trade): State {
  return {
    trade: next,
    past: [...state.past, state.trade].slice(-HISTORY_LIMIT),
    future: [],
  };
}

function reduce(state: State, action: Action): State {
  const { trade } = state;

  switch (action.type) {
    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return { trade: prev, past: state.past.slice(0, -1), future: [trade, ...state.future] };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return { trade: next, past: [...state.past, trade], future: state.future.slice(1) };
    }
    case "open":
      return { trade: { ...action.trade, readOnly: true }, past: [], future: [] };
    case "fork":
      return {
        trade: {
          ...trade,
          readOnly: false,
          mine: { ...trade.mine, cards: trade.mine.cards.map((c) => ({ ...c, id: newId() })), cash: trade.mine.cash.map((c) => ({ ...c, id: newId() })) },
          theirs: { ...trade.theirs, cards: trade.theirs.cards.map((c) => ({ ...c, id: newId() })), cash: trade.theirs.cash.map((c) => ({ ...c, id: newId() })) },
        },
        // Undo restores whatever local trade the fork replaced.
        past: [action.previous],
        future: [],
      };
    case "applyPrices": {
      // Not an undoable edit: only the live trade is repriced, history is left as it was.
      const refresh = (c: TradeCard): TradeCard => {
        const p = action.prices.get(priceKey(c)) ?? action.prices.get(`${c.set.toLowerCase()}:${c.collectorNumber}`);
        if (!p) return c;
        return {
          ...c,
          scryfallId: c.scryfallId || p.scryfallId,
          imageUrl: c.imageUrl ?? p.imageUrl,
          basePrice: basePriceFor(p.prices, c.finish),
          priceFetchedAt: action.at,
        };
      };
      const side = (s: TradeSide): TradeSide => ({ ...s, cards: s.cards.map(refresh) });
      return { ...state, trade: { ...trade, mine: side(trade.mine), theirs: side(trade.theirs) } };
    }
  }

  if (trade.readOnly) return state;

  switch (action.type) {
    case "addCard": {
      const existing = trade[action.side].cards.find((c) => sameLine(action.card, c));
      const next = existing
        ? editSide(trade, action.side, (s) => ({
            ...s,
            cards: s.cards.map((c) => (c.id === existing.id ? { ...c, quantity: c.quantity + action.card.quantity } : c)),
          }))
        : editSide(trade, action.side, (s) => ({ ...s, cards: [...s.cards, { ...action.card, id: newId() }] }));
      return commit(state, next);
    }
    case "removeCard":
      return commit(state, editSide(trade, action.side, (s) => ({ ...s, cards: s.cards.filter((c) => c.id !== action.id) })));
    case "updateCard": {
      if (!trade[action.side].cards.some((c) => c.id === action.id)) return state;
      const patch = { ...action.patch };
      if (patch.quantity !== undefined) patch.quantity = Math.max(1, Math.floor(patch.quantity));
      return commit(
        state,
        editSide(trade, action.side, (s) => ({ ...s, cards: s.cards.map((c) => (c.id === action.id ? { ...c, ...patch } : c)) }))
      );
    }
    case "setSideCondition": {
      if (!CONDITIONS.includes(action.condition) || trade[action.side].cards.length === 0) return state;
      return commit(
        state,
        editSide(trade, action.side, (s) => ({ ...s, cards: s.cards.map((c) => ({ ...c, condition: action.condition })) }))
      );
    }
    case "addCash":
      return commit(
        state,
        editSide(trade, action.side, (s) => ({ ...s, cash: [...s.cash, { id: newId(), amount: Math.max(0, action.amount) }] }))
      );
    case "updateCash":
      return commit(
        state,
        editSide(trade, action.side, (s) => ({
          ...s,
          cash: s.cash.map((c: CashLine) => (c.id === action.id ? { ...c, amount: Math.max(0, action.amount) } : c)),
        }))
      );
    case "removeCash":
      return commit(state, editSide(trade, action.side, (s) => ({ ...s, cash: s.cash.filter((c) => c.id !== action.id) })));
    case "setSettings":
      return commit(state, { ...trade, settings: { ...trade.settings, ...action.patch } });
    case "setSideDiscount":
      return commit(state, editSide(trade, action.side, (s) => ({ ...s, discountOverridePct: action.pct })));
    case "swap":
      return commit(state, { ...trade, mine: trade.theirs, theirs: trade.mine });
    case "clear": {
      if (isSideEmpty(trade.mine) && isSideEmpty(trade.theirs)) return state;
      return commit(state, { ...trade, mine: emptySide(), theirs: emptySide() });
    }
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export type RefreshStatus = "idle" | "loading";

export function useTrade(initial?: Trade) {
  const [state, dispatch] = useReducer(reduce, undefined, (): State => ({
    trade: initial ? { ...initial, readOnly: true } : loadLocalTrade(),
    past: [],
    future: [],
  }));
  const { trade } = state;

  // Persist the local trade only. A trade opened from a share link never overwrites it.
  useEffect(() => {
    if (!trade.readOnly) saveLocalTrade(trade);
  }, [trade]);

  const [staleIds, setStaleIds] = useState<Set<string>>(() => new Set());
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>("idle");
  const tradeRef = useRef(trade);
  tradeRef.current = trade;

  const refreshPrices = useCallback(async () => {
    const current = tradeRef.current;
    if (current.readOnly) return;
    const cards = [...current.mine.cards, ...current.theirs.cards];
    if (cards.length === 0) return;
    setRefreshStatus("loading");
    try {
      const prices = await fetchPrices(cards.map((c) => ({ scryfallId: c.scryfallId || undefined, set: c.set, collectorNumber: c.collectorNumber })));
      dispatch({ type: "applyPrices", prices, at: Date.now() });
      // Anything the lookup didn't return keeps its old price and is flagged stale.
      const stale = new Set<string>();
      for (const c of cards) {
        if (!prices.has(priceKey(c)) && !prices.has(`${c.set.toLowerCase()}:${c.collectorNumber}`)) stale.add(c.id);
      }
      setStaleIds(stale);
    } finally {
      setRefreshStatus("idle");
    }
  }, []);

  const localTradeIsEmpty = useCallback(() => {
    const local = loadLocalTrade();
    return isSideEmpty(local.mine) && isSideEmpty(local.theirs);
  }, []);

  const fork = useCallback(() => {
    if (!tradeRef.current.readOnly) return;
    dispatch({ type: "fork", previous: loadLocalTrade() });
  }, []);

  const derived = useMemo(() => {
    const mine = sideTotals(trade.mine, trade.settings);
    const theirs = sideTotals(trade.theirs, trade.settings);
    const bothPopulated = !isSideEmpty(trade.mine) && !isSideEmpty(trade.theirs);
    return {
      mineTotals: mine,
      theirTotals: theirs,
      fairness: fairness(mine.total, theirs.total, trade.settings.tolerancePct),
      /** Fairness is only meaningful once both sides have something on them. */
      isNeutral: !bothPopulated,
      missingPriceCount: mine.missingPriceCount + theirs.missingPriceCount,
    };
  }, [trade]);

  return {
    trade,
    ...derived,
    staleIds,
    refreshStatus,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,

    addCard: (side: SideKey, card: Omit<TradeCard, "id">) => dispatch({ type: "addCard", side, card }),
    removeCard: (side: SideKey, id: string) => dispatch({ type: "removeCard", side, id }),
    updateCard: (side: SideKey, id: string, patch: Partial<Omit<TradeCard, "id">>) =>
      dispatch({ type: "updateCard", side, id, patch }),
    setSideCondition: (side: SideKey, condition: Condition) => dispatch({ type: "setSideCondition", side, condition }),
    addCash: (side: SideKey, amount = 0) => dispatch({ type: "addCash", side, amount }),
    updateCash: (side: SideKey, id: string, amount: number) => dispatch({ type: "updateCash", side, id, amount }),
    removeCash: (side: SideKey, id: string) => dispatch({ type: "removeCash", side, id }),
    setSettings: (patch: Partial<TradeSettings>) => dispatch({ type: "setSettings", patch }),
    setSideDiscount: (side: SideKey, pct: number | undefined) => dispatch({ type: "setSideDiscount", side, pct }),
    swap: () => dispatch({ type: "swap" }),
    clear: () => dispatch({ type: "clear" }),
    undo: () => dispatch({ type: "undo" }),
    redo: () => dispatch({ type: "redo" }),
    open: (t: Trade) => dispatch({ type: "open", trade: t }),
    fork,
    localTradeIsEmpty,
    refreshPrices,
  };
}
