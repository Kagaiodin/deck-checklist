import { useCallback } from "react";
import type { CollectionStore } from "../../../store/collection";
import type { Trade, TradeLogCard, TradeLogEntry } from "../../../types/trade";
import { useLocalStorage } from "../../../hooks/useLocalStorage";
import { TRADE_LEDGER_KEY } from "../../../store/storageKeys";
import { applyTradeToCollection, sortLedger, tradeToLogEntry, type LogMeta } from "../../../utils/tradeLedger";

export interface LogTradeResult {
  entry: TradeLogEntry;
  shortfall: TradeLogCard[];
}

interface LedgerDeps {
  collectionStore: CollectionStore;
}

/** The trade ledger (newest first) and the only path by which a trade changes the Collection. */
export function useTradeLedger({ collectionStore }: LedgerDeps) {
  const [entries, setEntries] = useLocalStorage<TradeLogEntry[]>(TRADE_LEDGER_KEY, []);

  const logTrade = useCallback((trade: Trade, meta: LogMeta): LogTradeResult => {
    const entry = tradeToLogEntry(trade, meta);
    const { collection, shortfall } = applyTradeToCollection(collectionStore.get(), entry.cardsOut, entry.cardsIn);
    setEntries(prev => sortLedger([entry, ...prev]));
    collectionStore.update(() => collection, { source: "Trade log" });
    return { entry, shortfall };
  }, [collectionStore, setEntries]);

  /** Removes the entry only. Collection is deliberately left as the trade changed it. */
  const deleteEntry = useCallback((id: string) => setEntries(prev => prev.filter(e => e.id !== id)), [setEntries]);

  return { entries, setEntries, logTrade, deleteEntry };
}
