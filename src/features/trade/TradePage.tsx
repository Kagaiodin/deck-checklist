import { useEffect, useState } from "react";
import type { Collection, Deck } from "../../types/index";
import type { Trade } from "../../types/trade";
import { decodeTrade, extractPayload } from "../../utils/tradeShare";
import { TradeWorkspace } from "./TradeWorkspace";
import { BrokenLinkIcon, RefreshIcon } from "./components/TradeIcons";
import { EmptyState } from "../../components/EmptyState";
import "./TradePage.css";

interface TradePageProps {
  collection: Collection;
  decks: Deck[];
  /** Back to the Collection tab (the "Collection ›" breadcrumb). */
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

export function TradePage({ collection, decks, onBack }: TradePageProps) {
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
        <button type="button" onClick={onBack}>Collection</button>
        <span aria-hidden="true">›</span>
        <span aria-current="page">Trade</span>
      </nav>
      <header className="tr-page-head">
        <h1>Trade</h1>
        <p className="tr-page-sub">Weigh a trade. Doesn't change your collection.</p>
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
        />
      )}
    </div>
  );
}
