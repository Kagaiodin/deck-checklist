import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { OrdersPage, type OrdersPageProps } from "../orders/OrdersPage";
import { EmptyState } from "../../components/EmptyState";
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
}

const tabId = (t: TransactionsTab) => `tx-tab-${t}`;
const panelId = (t: TransactionsTab) => `tx-panel-${t}`;

export function TransactionsPage({ subTab, onSubTabChange, ordersProps }: TransactionsPageProps) {
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

  const placeholder: Record<"trades" | "binder", { title: string; body: ReactNode }> = {
    trades: { title: "No trades yet", body: "Trades and sales you log will appear here." },
    binder: { title: "Your Binder is on the way", body: "Cards you own beyond what your decks need will appear here." },
  };
  const { title, body } = placeholder[subTab];

  return (
    <section className="orders-panel">
      <div className="orders-container">
        <div className="orders-topbar">
          <div className="orders-topbar-left">
            <h1 className="orders-title">Transactions</h1>
          </div>
        </div>
        <div className="orders-body">
          {subnav}
          <div role="tabpanel" id={panelId(subTab)} aria-labelledby={tabId(subTab)}>
            <EmptyState
              icon={
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
                  strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 7h12l-3-3M17 17H5l3 3" />
                </svg>
              }
              title={title}
              body={body}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
