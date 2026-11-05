import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Collection, CollectionMeta } from "../../../types/index";
import type { DeckAction } from "../../../store/decks";
import type { Trade, TradeLogCard, TradeLogEntry } from "../../../types/trade";
import { useLocalStorage } from "../../../hooks/useLocalStorage";
import { applyTradeToCollection, tradeToLogEntry, type LogMeta } from "../../../utils/tradeLedger";

export const TRADE_LEDGER_KEY = "mtg-checklist-trade-ledger-v1";

export interface LogTradeResult {
  entry: TradeLogEntry;
  /** The Collection after the trade, for callers that hold their own copy. */
  collection: Collection;
  shortfall: TradeLogCard[];
}

interface LedgerDeps {
  /** Reads the Collection fresh from storage; App's own copy goes stale while Collection is open. */
  readCollection: () => Collection;
  setCollection: Dispatch<SetStateAction<Collection>>;
  setCollectionMeta: Dispatch<SetStateAction<CollectionMeta | null>>;
  dispatch: Dispatch<DeckAction>;
}

/** The trade ledger (newest first) and the only path by which a trade changes the Collection. */
export function useTradeLedger({ readCollection, setCollection, setCollectionMeta, dispatch }: LedgerDeps) {
  const [entries, setEntries] = useLocalStorage<TradeLogEntry[]>(TRADE_LEDGER_KEY, []);

  const logTrade = useCallback((trade: Trade, meta: LogMeta): LogTradeResult => {
    const entry = tradeToLogEntry(trade, meta);
    const { collection, shortfall } = applyTradeToCollection(readCollection(), entry.cardsOut, entry.cardsIn);
    setEntries(prev => [entry, ...prev]);
    setCollection(collection);
    const cardCount = Object.keys(collection).length;
    setCollectionMeta(prev => prev
      ? { ...prev, cardCount }
      : { fileName: "Trade log", importedAt: Date.now(), cardCount });
    dispatch({ type: "APPLY_COLLECTION", payload: collection });
    return { entry, collection, shortfall };
  }, [readCollection, setEntries, setCollection, setCollectionMeta, dispatch]);

  /** Removes the entry only. Collection is deliberately left as the trade changed it. */
  const deleteEntry = useCallback((id: string) => setEntries(prev => prev.filter(e => e.id !== id)), [setEntries]);

  return { entries, setEntries, logTrade, deleteEntry };
}
