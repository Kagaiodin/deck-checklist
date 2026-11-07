import { useCallback, type Dispatch } from "react";
import type { Collection } from "../../../types/index";
import type { DeckAction } from "../../../store/decks";
import type { CollectionStore } from "../../../store/collection";
import type { Trade, TradeLogCard, TradeLogEntry } from "../../../types/trade";
import { useLocalStorage } from "../../../hooks/useLocalStorage";
import { applyTradeToCollection, sortLedger, tradeToLogEntry, type LogMeta } from "../../../utils/tradeLedger";

export const TRADE_LEDGER_KEY = "mtg-checklist-trade-ledger-v1";

export interface LogTradeResult {
  entry: TradeLogEntry;
  /** The Collection after the trade, for callers that hold their own copy. */
  collection: Collection;
  shortfall: TradeLogCard[];
}

interface LedgerDeps {
  collection: CollectionStore;
  dispatch: Dispatch<DeckAction>;
}

/** The trade ledger (newest first) and the only path by which a trade changes the Collection. */
export function useTradeLedger({ collection: store, dispatch }: LedgerDeps) {
  const [entries, setEntries] = useLocalStorage<TradeLogEntry[]>(TRADE_LEDGER_KEY, []);

  const logTrade = useCallback((trade: Trade, meta: LogMeta): LogTradeResult => {
    const entry = tradeToLogEntry(trade, meta);
    const { collection, shortfall } = applyTradeToCollection(store.get(), entry.cardsOut, entry.cardsIn);
    setEntries(prev => sortLedger([entry, ...prev]));
    store.update(() => collection, { source: "Trade log" });
    dispatch({ type: "APPLY_COLLECTION", payload: collection });
    return { entry, collection, shortfall };
  }, [store, setEntries, dispatch]);

  /** Removes the entry only. Collection is deliberately left as the trade changed it. */
  const deleteEntry = useCallback((id: string) => setEntries(prev => prev.filter(e => e.id !== id)), [setEntries]);

  return { entries, setEntries, logTrade, deleteEntry };
}
