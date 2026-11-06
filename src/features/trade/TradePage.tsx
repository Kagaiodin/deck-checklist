import { useEffect, useState } from "react";
import type { Collection, Deck } from "../../types/index";
import type { Trade } from "../../types/trade";
import type { LogMeta } from "../../utils/tradeLedger";
import type { LogTradeResult } from "../transactions/ledger/useTradeLedger";
import { decodeTrade, extractPayload } from "../../utils/tradeShare";
import { TradeWorkspace } from "./TradeWorkspace";
import type { TradeSeed } from "./seedCard";
import { BrokenLinkIcon, RefreshIcon } from "./components/TradeIcons";
import { EmptyState } from "../../components/EmptyState";
import "./TradePage.css";

/** Where the Calculator was opened from; decides the back control's label and target. */
export type TradeOrigin = "collection" | "binder" | "trades" | "link";

const ORIGIN_LABEL: Record<TradeOrigin, string> = {
  collection: "Collection",
  binder: "Binder",
  trades: "Trades & sales",
  link: "Binder",
};

interface TradePageProps {
  collection: Collection;
  decks: Deck[];
  origin?: TradeOrigin;
  /** Card to pre-add to My offer. */
  seed?: TradeSeed;
  /** Logs the trade to the ledger and Collection. */
  onLogTrade?: (trade: Trade, meta: LogMeta) => LogTradeResult;
  onViewEntry?: (id: string) => void;
  /** Back to the origin (the breadcrumb's first crumb). */
  onBack: () => void;
}

type Load =
  | { status: "local" }
  | { status: "decoding" }
  | { status: "shared"; trade: Trade; snapshotAt: number }
  | { status: "version" }
  | { status: "broken" };

/** Drops `#trade=…` from the address bar without adding a history entry. */
export function clearTradeHash() {
  if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

export function TradePage({ collection, decks, origin = "collection", seed, onLogTrade, onViewEntry, onBack }: TradePageProps) {
  const [load, setLoad] = useState<Load>(() => (extractPayload(window.location.hash) ? { status: "decoding" } : { status: "local" }));

  useEffect(() => {
    const payload = extractPayload(window.location.hash);
    if (!payload) return;
    let cancelled = false;
    void decodeTrade(payload).then((res) => {
      if (cancelled) return;
      if (res.ok) setLoad({ status: "shared", trade: res.trade, snapshotAt: res.snapshotAt });
      else setLoad({ status: res.reason === "version" ? "version" : "broken" });
    });
    return () => { cancelled = true; };
  }, []);

  function startOwn() {
    clearTradeHash();
    setLoad({ status: "local" });
  }

  return (
    <div className="trade-page">
      <nav className="tr-crumb" aria-label="Breadcrumb">
        <button type="button" onClick={onBack}>{ORIGIN_LABEL[origin]}</button>
        <span aria-hidden="true">›</span>
        <span aria-current="page">Trade</span>
      </nav>
      <header className="tr-page-head">
        <h1>Trade</h1>
        <p className="tr-page-sub">Weigh a trade. Your collection only changes if you log it.</p>
      </header>

      {load.status === "decoding" && <p className="tr-note" role="status">Opening shared trade…</p>}

      {load.status === "version" && (
        <div className="tr-error-card">
          <EmptyState
            icon={<RefreshIcon size={26} />}
            title="This link needs a newer version"
            body="It was made with a newer version of Fetchlist. Reload to get the latest version, then open the link again."
            primary={{ label: "Reload", onClick: () => window.location.reload() }}
            secondary={{ label: "Start my own trade", onClick: startOwn }}
          />
        </div>
      )}

      {load.status === "broken" && (
        <div className="tr-error-card">
          <EmptyState
            icon={<BrokenLinkIcon size={26} />}
            title="This trade link is broken"
            body="It may have been cut off when it was copied. Ask for a fresh link, or start your own trade."
            primary={{ label: "Start my own trade", onClick: startOwn }}
          />
        </div>
      )}

      {(load.status === "local" || load.status === "shared") && (
        <TradeWorkspace
          initial={load.status === "shared" ? load.trade : undefined}
          snapshotAt={load.status === "shared" ? load.snapshotAt : null}
          collection={collection}
          decks={decks}
          onForked={clearTradeHash}
          seed={seed}
          onLogTrade={onLogTrade}
          onViewEntry={onViewEntry}
        />
      )}
    </div>
  );
}
