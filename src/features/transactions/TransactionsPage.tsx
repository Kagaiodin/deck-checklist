import { useEffect, useRef, type KeyboardEvent } from "react";
import { OrdersPage, type OrdersPageProps } from "../orders/OrdersPage";
import type { Collection } from "../../types/index";
import type { TradeLogEntry } from "../../types/trade";
import { LedgerPanel } from "./ledger/LedgerPanel";
import type { TradeSeed } from "../trade/seedCard";
import { BinderPanel } from "./binder/BinderPanel";
import { primaryPrinting, type BinderRow } from "./binder/binderSurplus";
import { useBinder } from "./binder/useBinder";
import "./TransactionsPage.css";

export type TransactionsTab = "buys" | "trades" | "binder";

const TABS: { id: TransactionsTab; label: string }[] = [
  { id: "buys", label: "Buys" },
  { id: "trades", label: "Trades & sales" },
  { id: "binder", label: "Binder" },
];

interface TransactionsPageProps {
  /** Controlled by App: onViewOrder, the Calculator's back control and share links all set it. */
  subTab: TransactionsTab;
  onSubTabChange: (tab: TransactionsTab) => void;
  /** Passed through to OrdersPage for the Buys sub-tab, unchanged. */
  ordersProps: Omit<OrdersPageProps, "heading" | "subnav" | "panel">;
  /** Current Collection (read fresh by App when this view opens), for the derived Binder. */
  collection: Collection;
  /** Opens the Calculator from the Binder; `seed` pre-adds a card to My offer. */
  onOpenTrade: (seed?: TradeSeed) => void;
  onViewCollection: () => void;
  /** The trade ledger, newest first. */
  ledger: TradeLogEntry[];
  onDeleteLedgerEntry: (id: string) => void;
  /** Entry to show in detail (set after "Log this trade"); null shows the list. */
  ledgerOpenId: string | null;
  onLedgerOpenChange: (id: string | null) => void;
}

/** A Binder row as a Calculator seed: its largest-quantity printing. */
function rowToSeed(row: BinderRow): TradeSeed {
  const p = primaryPrinting(row);
  return { name: row.key, set: p?.set, collectorNumber: p?.collectorNumber, foil: p?.foil };
}

const tabId = (t: TransactionsTab) => `tx-tab-${t}`;
const panelId = (t: TransactionsTab) => `tx-panel-${t}`;

export function TransactionsPage({ subTab, onSubTabChange, ordersProps, collection, onOpenTrade, onViewCollection, ledger, onDeleteLedgerEntry, ledgerOpenId, onLedgerOpenChange }: TransactionsPageProps) {
  const binder = useBinder(collection, ordersProps.decks);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  // Buys and the other panels render different trees, so the tablist remounts on a switch;
  // put focus back on the newly selected tab once it exists.
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    tabRefs.current[subTab]?.focus();
  }, [subTab]);

  function select(tab: TransactionsTab) {
    if (tab === subTab) return;
    refocus.current = true;
    onSubTabChange(tab);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = TABS.findIndex(t => t.id === subTab);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    select(TABS[next].id);
  }

  const subnav = (
    <div
      className="order-filter-tabs tx-subtabs"
      role="tablist"
      aria-label="Transactions sections"
      onKeyDown={onKeyDown}
    >
      {TABS.map(t => (
        <button
          key={t.id}
          ref={el => { tabRefs.current[t.id] = el; }}
          id={tabId(t.id)}
          type="button"
          role="tab"
          className={`order-filter-tab${subTab === t.id ? " active" : ""}`}
          aria-selected={subTab === t.id}
          aria-controls={panelId(t.id)}
          tabIndex={subTab === t.id ? 0 : -1}
          onClick={() => select(t.id)}
        >
          {t.label}
          {t.id === "buys" && ordersProps.orders.length > 0 && (
            <span className="count">{ordersProps.orders.length}</span>
          )}
          {t.id === "trades" && ledger.length > 0 && (
            <span className="count">{ledger.length}</span>
          )}
          {t.id === "binder" && binder.rows.length > 0 && (
            <span className="count">{binder.rows.length}</span>
          )}
        </button>
      ))}
    </div>
  );

  if (subTab === "buys") {
    return (
      <OrdersPage
        {...ordersProps}
        heading="Transactions"
        subnav={subnav}
        panel={{ id: panelId("buys"), labelledBy: tabId("buys") }}
      />
    );
  }

  // The id can outlive its entry (replace import, delete elsewhere); only a real entry replaces the list.
  const entryOpen = !!ledgerOpenId && ledger.some(e => e.id === ledgerOpenId);

  return (
    <section className="orders-panel">
      <div className="orders-container">
        <div className="orders-topbar">
          <div className="orders-topbar-left">
            <h1 className="orders-title">Transactions</h1>
            {subTab === "binder" && binder.rows.length > 0 && (
              <span className="orders-count">{binder.rows.length} {binder.rows.length === 1 ? "card" : "cards"}</span>
            )}
          </div>
          {(subTab === "binder" || (subTab === "trades" && ledger.length > 0 && !entryOpen)) && (
            <div className="orders-topbar-right">
              <button type="button" className="btn btn-primary btn-sm tx-new-trade" onClick={() => onOpenTrade()}>New trade</button>
            </div>
          )}
        </div>
        <div className="orders-body">
          {subnav}
          <div role="tabpanel" id={panelId(subTab)} aria-labelledby={tabId(subTab)}>
            {subTab === "binder" ? (
              <BinderPanel
                collection={collection}
                binder={binder}
                onNewTrade={() => onOpenTrade()}
                onAddToTrade={row => onOpenTrade(rowToSeed(row))}
                onViewCollection={onViewCollection}
              />
            ) : (
              <LedgerPanel
                entries={ledger}
                openId={ledgerOpenId}
                onOpenChange={onLedgerOpenChange}
                onNewTrade={() => onOpenTrade()}
                onDelete={onDeleteLedgerEntry}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
