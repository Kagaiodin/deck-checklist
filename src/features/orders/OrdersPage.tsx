import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import "./OrdersPage.css";
import type { Order, OrderCard, OrderStatus, Deck } from "../../types/index";
import { getTrackingUrl, CARRIER_NAMES } from "../../utils/carrier";
import { NewOrderSheet } from "./NewOrderSheet";

// ── ETA helpers ───────────────────────────────────────────────────────────────

function formatShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function daysFromNow(ts: number): number {
  return Math.round((ts - Date.now()) / (24 * 60 * 60 * 1000));
}

function daysOverdue(ts: number): number {
  return Math.ceil((Date.now() - ts) / (24 * 60 * 60 * 1000));
}

function totalQty(order: Order): number {
  return order.cards.reduce((s, c) => s + c.quantity, 0);
}

function etaInfo(expectedArrival: number | undefined): { label: string; cls: string; days?: number } | null {
  if (!expectedArrival) return null;
  const d = daysFromNow(expectedArrival);
  if (d < 0) {
    const n = daysOverdue(expectedArrival);
    return { label: `${n} day${n !== 1 ? "s" : ""} overdue`, cls: "late", days: n };
  }
  if (d === 0) return { label: "Arrives today", cls: "warn" };
  if (d === 1) return { label: "Arrives tomorrow", cls: "warn" };
  if (d <= 6) {
    const weekday = new Date(expectedArrival).toLocaleDateString(undefined, { weekday: "long" });
    return { label: `Arrives ${weekday}`, cls: "" };
  }
  return { label: `Arrives ${formatShortDate(expectedArrival)}`, cls: "" };
}

// ── Timeline helpers ──────────────────────────────────────────────────────────

type TlDot = "done" | "now" | "warn" | "late" | "pending";

interface TlStep {
  dot: TlDot;
  when: string;
  what: string;
  sub?: string;
  subVariant?: "mono" | "late";
  subDays?: number;
}

function buildTimeline(order: Order & { isLate: boolean }): TlStep[] {
  const steps: TlStep[] = [];

  // Step 1 — always present
  steps.push({
    dot: "done",
    when: formatShortDate(order.orderDate ?? order.createdAt),
    what: "Order placed",
    sub: order.vendor,
  });

  // Step 2 — only when tracking number is present
  // TODO: replace static "Shipped" with real carrier API events when tracking
  // integration lands (carrier.trackEvents(trackingNumber, carrier) → TlStep[])
  if (order.trackingNumber) {
    const carrierName = order.carrier ? CARRIER_NAMES[order.carrier] : "Carrier";
    steps.push({
      dot: "done",
      when: "—",
      what: "Shipped",
      sub: `${carrierName} ${order.trackingNumber}`,
      subVariant: "mono",
    });
  }

  // Step 3 — expected / delivered
  if (order.expectedArrival) {
    let dot: TlDot = "pending";
    let what = "Expected delivery";
    let sub: string | undefined;
    let subVariant: TlStep["subVariant"];
    let subDays: number | undefined;
    if (order.status === "received") {
      dot = "done"; what = "Delivered";
    } else if (order.isLate) {
      const n = daysOverdue(order.expectedArrival);
      dot = "late"; sub = `${n} day${n !== 1 ? "s" : ""} late`; subVariant = "late"; subDays = n;
    } else {
      const d = daysFromNow(order.expectedArrival);
      if (d <= 1) dot = "warn";
    }
    steps.push({ dot, when: formatShortDate(order.expectedArrival), what, sub, subVariant, subDays });
  }

  return steps;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface OrdersPageProps {
  orders: Order[];
  decks: Deck[];
  recentVendors: string[];
  onCreateOrder: (order: Order, vendor: string) => void;
  onUpdateOrder: (order: Order) => void;
  onMarkReceived: (orderId: string) => void;
  onMarkCancelled: (orderId: string) => void;
  onDeleteOrder: (orderId: string) => void;
  onOpenBuyList?: () => void;
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function TlRow({ dot, when, what, sub, subVariant, subDays }: TlStep) {
  return (
    <div className="tl-row">
      <span className={`tl-dot ${dot}`} />
      <span className="tl-when">{when}</span>
      <span className="tl-what">
        {what}
        {sub && (
          <span className={`tl-sub${subVariant ? ` ${subVariant}` : ""}`}>
            {subVariant === "late" && subDays !== undefined
              ? <><span className="num">{subDays}</span> day{subDays !== 1 ? "s" : ""} late</>
              : sub}
          </span>
        )}
      </span>
    </div>
  );
}

function LineItems({ cards }: { cards: OrderCard[] }) {
  const hasPrices = cards.some(c => (c.price ?? 0) > 0);
  const subtotal = hasPrices
    ? cards.reduce((s, c) => s + (c.price ?? 0) * c.quantity, 0)
    : 0;

  return (
    <div className={`ocard-lineitems${hasPrices ? " has-prices" : ""}`}>
      {cards.map(oc => (
        <div key={`${oc.deckId ?? "free"}-${oc.cardName}`} className="li">
          <span className="li-qty">×{oc.quantity}</span>
          <span className="li-name">{oc.cardName}</span>
          {hasPrices && (
            <span className="li-price">
              {(oc.price ?? 0) > 0 ? `$${(oc.price! * oc.quantity).toFixed(2)}` : "—"}
            </span>
          )}
        </div>
      ))}
      {subtotal > 0 && (
        <div className="li-subtotal">
          <span>Subtotal</span>
          <span className="li-subtotal-v">${subtotal.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

// ── Mobile detail sheet (full-screen portal) ──────────────────────────────────

interface OrderDetailSheetProps {
  order: Order & { isLate: boolean };
  decks: Deck[];
  onClose: () => void;
  onMarkReceived: () => void;
  onMarkCancelled: () => void;
  onDeleteOrder: () => void;
}

function OrderDetailSheet({
  order, decks, onClose, onMarkReceived, onMarkCancelled, onDeleteOrder,
}: OrderDetailSheetProps) {
  const eta = etaInfo(order.expectedArrival);
  const timeline = buildTimeline(order);
  const qty = totalQty(order);
  const orderDateStr = order.orderDate
    ? `Ordered ${formatShortDate(order.orderDate)}`
    : `Added ${formatShortDate(order.createdAt)}`;

  const linkedDecks = useMemo(() => {
    const ids = [...new Set(order.cards.map(c => c.deckId).filter(Boolean) as string[])];
    return ids.map(id => decks.find(d => d.id === id)).filter(Boolean) as Deck[];
  }, [order.cards, decks]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  let statusCls = "active";
  let statusLabel = "Active";
  if (order.status === "received") { statusCls = "ok"; statusLabel = "Received"; }
  else if (order.status === "cancelled") { statusCls = "muted"; statusLabel = "Cancelled"; }
  else if (order.isLate && eta) { statusCls = "late"; statusLabel = eta.label; }
  else if (eta?.cls === "warn") { statusCls = "warn"; statusLabel = eta.label; }
  else if (eta) { statusLabel = eta.label; }

  return createPortal(
    <div className="ocard-mob-sheet-backdrop" onClick={onClose}>
      <div className="ocard-mob-sheet" onClick={e => e.stopPropagation()}>
        {/* Nav */}
        <div className="ocard-mob-nav">
          <button className="ocard-mob-back" onClick={onClose} aria-label="Back">‹</button>
          <span className="ocard-mob-nav-title">Order detail</span>
        </div>

        <div className="ocard-mob-body">
          {/* Hero */}
          <div className="ocard-mob-hero">
            <span className="ocard-mob-vendor">{order.vendor}</span>
            <span className="ocard-mob-sub">{orderDateStr}</span>
          </div>

          <span className={`ocard-mob-status-pill ${statusCls}`}>● {statusLabel}</span>

          {/* Tracking CTA */}
          {order.trackingNumber && order.carrier && (
            <a
              className="ocard-mob-tracking-cta"
              href={getTrackingUrl(order.trackingNumber, order.carrier)}
              target="_blank" rel="noopener noreferrer"
            >
              <div>
                <div className="ocard-mob-cta-k">Tracking</div>
                <div className="ocard-mob-cta-v">
                  {CARRIER_NAMES[order.carrier]} ···{order.trackingNumber.replace(/\s/g, "").slice(-4)}
                </div>
              </div>
              <span className="ocard-mob-cta-arrow">↗</span>
            </a>
          )}

          {/* Timeline */}
          <div className="ocard-mob-section">
            <h3 className="panel-h">Timeline</h3>
            <div className="ocard-timeline">
              {timeline.map((step, i) => <TlRow key={i} {...step} />)}
            </div>
          </div>

          {/* Cards */}
          <div className="ocard-mob-section">
            <h3 className="panel-h">Cards · {qty} {qty === 1 ? "copy" : "copies"}</h3>
            <LineItems cards={order.cards} />
          </div>

          {/* Linked decks */}
          {linkedDecks.length > 0 && (
            <div className="ocard-mob-section">
              <h3 className="panel-h">Linked deck{linkedDecks.length !== 1 ? "s" : ""}</h3>
              {linkedDecks.map(d => (
                <div key={d.id} className="ocard-linked-deck">{d.name}</div>
              ))}
            </div>
          )}
        </div>

        {/* Stacked actions */}
        <div className="ocard-mob-actions">
          {order.status === "active" && (
            <>
              <button className="btn btn-primary" onClick={onMarkReceived}>✓ Mark received</button>
              <button className="btn" onClick={onMarkCancelled}>Cancel order</button>
            </>
          )}
          <button
            className="btn"
            style={{ color: "var(--danger)", marginTop: order.status !== "active" ? 0 : 4 }}
            onClick={onDeleteOrder}
          >
            Delete order
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── OCard component ───────────────────────────────────────────────────────────

interface OCardProps {
  order: Order & { isLate: boolean };
  decks: Deck[];
  isExpanded: boolean;
  isMobile: boolean;
  isConfirmingDelete: boolean;
  onExpand: () => void;
  onMarkReceived: () => void;
  onMarkCancelled: () => void;
  onDeleteOrder: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onReorder: () => void;
  onEdit: () => void;
}

function OCard({
  order, decks, isExpanded, isMobile, isConfirmingDelete,
  onExpand, onMarkReceived, onMarkCancelled, onDeleteOrder, onConfirmDelete, onCancelDelete, onReorder, onEdit,
}: OCardProps) {
  const [showCards, setShowCards] = useState(false);
  const qty = totalQty(order);
  const eta = etaInfo(order.expectedArrival);
  const isLate = order.isLate;
  const isWarnTomorrow = !isLate && eta?.cls === "warn" && daysFromNow(order.expectedArrival ?? 0) === 1;

  let stateClass = "";
  if (order.status === "received")  stateClass = "state-ok";
  else if (order.status === "cancelled") stateClass = "state-cancelled state-muted";
  else if (isLate) stateClass = "state-late";
  else if (isWarnTomorrow) stateClass = "state-warn";

  const orderDateStr = order.orderDate
    ? `Ordered ${formatShortDate(order.orderDate)}`
    : `Added ${formatShortDate(order.createdAt)}`;

  const tnTail = order.trackingNumber
    ? `···${order.trackingNumber.replace(/\s/g, "").slice(-4)}`
    : null;

  // Timeline for desktop panel
  const timeline = buildTimeline(order);

  // Linked decks for desktop panel
  const linkedDecks = useMemo(() => {
    const ids = [...new Set(order.cards.map(c => c.deckId).filter(Boolean) as string[])];
    return ids.map(id => decks.find(d => d.id === id)).filter(Boolean) as Deck[];
  }, [order.cards, decks]);

  const lineCount = order.cards.length;

  return (
    <div
      className={`ocard ${stateClass}${isExpanded ? " expanded" : ""}`}
      onClick={e => {
        const target = e.target as HTMLElement;
        if (target.closest("button") || target.closest("a")) return;
        onExpand();
      }}
    >
      {/* Top row: vendor | cards | hover-actions | chevron */}
      <div className="ocard-top">
        <div className="ocard-vendor">
          <span className="ocard-vendor-name">{order.vendor}</span>
          <span className="ocard-vendor-sub">{orderDateStr}</span>
        </div>

        <div className="ocard-cards-cell">
          <span className="num">{qty}</span><span className="lbl"> card{qty !== 1 ? "s" : ""}</span>
        </div>

        <div className="ocard-actions">
          {!isExpanded && order.status === "active" && (
            <button
              className="btn btn-sm btn-quiet ocard-actions btn-recv"
              onClick={e => { e.stopPropagation(); onMarkReceived(); }}
            >
              ✓ Mark received
            </button>
          )}
          {!isExpanded && (order.status === "received" || order.status === "cancelled") && (
            <button
              className="btn btn-sm btn-quiet"
              onClick={e => { e.stopPropagation(); onReorder(); }}
            >
              Re-order
            </button>
          )}
        </div>

        <button
          className={`ocard-chev${isExpanded ? " open" : ""}`}
          onClick={e => { e.stopPropagation(); onExpand(); }}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          ›
        </button>
      </div>

      {/* Bottom row: eta | tracking */}
      <div className="ocard-bot">
        <div className="ocard-eta">
          {order.status === "active" && eta ? (
            <>
              <span className={`ocard-eta-when ${eta.cls}`}>
                {eta.cls === "late" && eta.days !== undefined
                  ? <><span className="num">{eta.days}</span> day{eta.days !== 1 ? "s" : ""} overdue</>
                  : eta.label}
              </span>
              {isWarnTomorrow && <span className="ocard-pill warn">Arrives tomorrow</span>}
              {eta.cls === "late" && order.expectedArrival && (
                <>
                  <span className="ocard-eta-dot">·</span>
                  <span className="ocard-eta-exp">Expected {formatShortDate(order.expectedArrival)}</span>
                </>
              )}
            </>
          ) : order.status === "received" ? (
            <>
              <span className="ocard-eta-when ok">
                Received {formatShortDate(order.expectedArrival ?? order.createdAt)}
              </span>
              <span className="ocard-pill ok">Received</span>
            </>
          ) : order.status === "cancelled" ? (
            <>
              <span className="ocard-eta-when dim">Cancelled {formatShortDate(order.createdAt)}</span>
              <span className="ocard-pill muted">Cancelled</span>
            </>
          ) : (
            <span className="ocard-eta-when">No expected date</span>
          )}
        </div>

        {order.status === "cancelled" ? (
          <span className="ocard-tracking-empty">—</span>
        ) : order.trackingNumber && order.carrier ? (
          <a
            className="ocard-tracking"
            href={getTrackingUrl(order.trackingNumber, order.carrier)}
            target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
          >
            <span className="carrier">{CARRIER_NAMES[order.carrier]}</span>
            {tnTail}
            <span className="arrow">↗</span>
          </a>
        ) : order.status === "active" ? (
          <span className="ocard-tracking-empty">No tracking</span>
        ) : null}
      </div>

      {/* Desktop expanded panel (hidden on mobile — mobile uses the sheet portal) */}
      {isExpanded && !isMobile && (
        <div className="ocard-panel">

          {order.status === "received" ? (
            /* ── Received: summary + optional card list ── */
            <>
              <div className="ocard-panel-left">
                <div className="ocard-panel-section">
                  <div className="panel-h">Order summary</div>
                  <div className="recv-summary">
                    <div>
                      <strong>{qty} of {qty} cards</strong>
                      {" · "}added to collection {formatShortDate(order.expectedArrival ?? order.createdAt)}
                    </div>
                    <button
                      className="recv-toggle"
                      onClick={e => { e.stopPropagation(); setShowCards(v => !v); }}
                    >
                      {showCards ? "Hide cards ▴" : "Show cards ▾"}
                    </button>
                  </div>
                  {showCards && <LineItems cards={order.cards} />}
                </div>

                <div className="ocard-panel-actions">
                  <button
                    className="btn btn-sm btn-quiet"
                    onClick={e => { e.stopPropagation(); onReorder(); }}
                  >
                    Re-order
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={e => { e.stopPropagation(); onEdit(); }}
                  >
                    Edit
                  </button>
                  {isConfirmingDelete ? (
                    <div className="ocard-delete-confirm">
                      <span className="ocard-delete-confirm-text">Delete this order?</span>
                      <button className="btn btn-sm btn-ghost"
                        onClick={e => { e.stopPropagation(); onConfirmDelete(); }}>Yes, delete</button>
                      <button className="btn btn-sm btn-ghost"
                        onClick={e => { e.stopPropagation(); onCancelDelete(); }}>Keep</button>
                    </div>
                  ) : (
                    <button className="btn btn-sm btn-ghost ocard-delete-btn"
                      onClick={e => { e.stopPropagation(); onDeleteOrder(); }}>Delete</button>
                  )}
                </div>
              </div>

              <div className="ocard-panel-right">
                {linkedDecks.length > 0 && (
                  <div className="ocard-panel-section">
                    <div className="panel-h">Linked deck{linkedDecks.length !== 1 ? "s" : ""}</div>
                    {linkedDecks.map(d => (
                      <div key={d.id} className="ocard-linked-deck">{d.name}</div>
                    ))}
                  </div>
                )}
                <div className="ocard-panel-section">
                  <div className="panel-h">Timeline</div>
                  <div className="ocard-timeline">
                    {timeline.map((step, i) => <TlRow key={i} {...step} />)}
                  </div>
                </div>
              </div>
            </>

          ) : order.status === "cancelled" ? (
            /* ── Cancelled: cards + re-order, no action buttons ── */
            <>
              <div className="ocard-panel-left">
                <div className="ocard-panel-section">
                  <div className="panel-h">Timeline</div>
                  <div className="ocard-timeline">
                    {timeline.map((step, i) => <TlRow key={i} {...step} />)}
                  </div>
                </div>

                <div className="ocard-panel-actions">
                  <button
                    className="btn btn-sm btn-quiet"
                    onClick={e => { e.stopPropagation(); onReorder(); }}
                  >
                    Re-order
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={e => { e.stopPropagation(); onEdit(); }}
                  >
                    Edit
                  </button>
                  {isConfirmingDelete ? (
                    <div className="ocard-delete-confirm">
                      <span className="ocard-delete-confirm-text">Delete this order?</span>
                      <button className="btn btn-sm btn-ghost"
                        onClick={e => { e.stopPropagation(); onConfirmDelete(); }}>Yes, delete</button>
                      <button className="btn btn-sm btn-ghost"
                        onClick={e => { e.stopPropagation(); onCancelDelete(); }}>Keep</button>
                    </div>
                  ) : (
                    <button className="btn btn-sm btn-ghost ocard-delete-btn"
                      onClick={e => { e.stopPropagation(); onDeleteOrder(); }}>Delete</button>
                  )}
                </div>
              </div>

              <div className="ocard-panel-right">
                <div className="ocard-panel-section">
                  <div className="panel-h">
                    Cards · {lineCount} line{lineCount !== 1 ? "s" : ""} · {qty} {qty === 1 ? "copy" : "copies"}
                  </div>
                  <LineItems cards={order.cards} />
                </div>
                {linkedDecks.length > 0 && (
                  <div className="ocard-panel-section">
                    <div className="panel-h">Linked deck{linkedDecks.length !== 1 ? "s" : ""}</div>
                    {linkedDecks.map(d => (
                      <div key={d.id} className="ocard-linked-deck">{d.name}</div>
                    ))}
                  </div>
                )}
              </div>
            </>

          ) : (
            /* ── Active: timeline + actions | line items ── */
            <>
              <div className="ocard-panel-left">
                <div className="ocard-panel-section">
                  <div className="panel-h">
                    {order.trackingNumber
                      ? `Tracking · ${order.carrier ? CARRIER_NAMES[order.carrier] : ""} ${order.trackingNumber}`
                      : "Timeline"}
                  </div>
                  <div className="ocard-timeline">
                    {timeline.map((step, i) => <TlRow key={i} {...step} />)}
                  </div>
                </div>

                <div className="ocard-panel-actions">
                  <button
                    className="btn btn-sm btn-recv"
                    onClick={e => { e.stopPropagation(); onMarkReceived(); }}
                  >
                    ✓ Mark received
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={e => { e.stopPropagation(); onEdit(); }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-sm btn-quiet"
                    onClick={e => { e.stopPropagation(); onMarkCancelled(); }}
                  >
                    Cancel order
                  </button>
                  {isConfirmingDelete ? (
                    <div className="ocard-delete-confirm">
                      <span className="ocard-delete-confirm-text">Delete this order?</span>
                      <button className="btn btn-sm btn-ghost"
                        onClick={e => { e.stopPropagation(); onConfirmDelete(); }}>Yes, delete</button>
                      <button className="btn btn-sm btn-ghost"
                        onClick={e => { e.stopPropagation(); onCancelDelete(); }}>Keep</button>
                    </div>
                  ) : (
                    <button className="btn btn-sm btn-ghost ocard-delete-btn"
                      onClick={e => { e.stopPropagation(); onDeleteOrder(); }}>Delete</button>
                  )}
                </div>
              </div>

              <div className="ocard-panel-right">
                <div className="ocard-panel-section">
                  <div className="panel-h">
                    Cards · {lineCount} line{lineCount !== 1 ? "s" : ""} · {qty} {qty === 1 ? "copy" : "copies"}
                  </div>
                  <LineItems cards={order.cards} />
                </div>
                {linkedDecks.length > 0 && (
                  <div className="ocard-panel-section">
                    <div className="panel-h">Linked deck{linkedDecks.length !== 1 ? "s" : ""}</div>
                    {linkedDecks.map(d => (
                      <div key={d.id} className="ocard-linked-deck">{d.name}</div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      )}
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────

export function OrdersPage({
  orders, decks, recentVendors,
  onCreateOrder, onUpdateOrder, onMarkReceived, onMarkCancelled, onDeleteOrder, onOpenBuyList,
}: OrdersPageProps) {
  const [filter, setFilter] = useState<OrderStatus | "all">("active");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editOrderId, setEditOrderId] = useState<string | null>(null);
  const [reorderVendor, setReorderVendor] = useState("");
  const [search, setSearch] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 640px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const now = Date.now();

  const annotated = useMemo(() => orders.map(o => ({
    ...o,
    isLate: o.status === "active" && o.expectedArrival != null && o.expectedArrival < now,
  })), [orders, now]);

  const counts = useMemo(() => ({
    active:    annotated.filter(o => o.status === "active").length,
    received:  annotated.filter(o => o.status === "received").length,
    cancelled: annotated.filter(o => o.status === "cancelled").length,
    all:       annotated.length,
  }), [annotated]);

  const overdueCount = useMemo(
    () => annotated.filter(o => o.isLate).length,
    [annotated],
  );

  const filtered = useMemo(() => {
    let list = filter === "all" ? annotated : annotated.filter(o => o.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.vendor.toLowerCase().includes(q) ||
        o.trackingNumber?.toLowerCase().includes(q) ||
        o.cards.some(c => c.cardName.toLowerCase().includes(q))
      );
    }
    return list;
  }, [annotated, filter, search]);

  const sorted = useMemo(() => {
    if (filter === "active") {
      return [...filtered].sort((a, b) => {
        if (a.isLate !== b.isLate) return a.isLate ? -1 : 1;
        return (a.expectedArrival ?? Infinity) - (b.expectedArrival ?? Infinity);
      });
    }
    return filtered;
  }, [filtered, filter]);

  const countLabel = filter === "active"
    ? `${counts.active} active`
    : filter === "received"
    ? `${counts.received} received`
    : filter === "cancelled"
    ? `${counts.cancelled} cancelled`
    : `${counts.all} total`;

  const cardsInFlight = useMemo(
    () => annotated.filter(o => o.status === "active").reduce((s, o) => s + totalQty(o), 0),
    [annotated],
  );

  const activeSpend = useMemo(
    () => annotated
      .filter(o => o.status === "active")
      .reduce((s, o) => s + o.cards.reduce((cs, c) => cs + (c.price ?? 0) * c.quantity, 0), 0),
    [annotated],
  );

  function handleExpand(id: string) {
    setExpandedId(prev => (prev === id ? null : id));
    setDeleteConfirmId(null);
  }

  function handleReorder(vendor: string) {
    setReorderVendor(vendor);
    setShowCreate(true);
    setExpandedId(null);
  }

  function handleEditOrder(id: string) {
    setEditOrderId(id);
    setExpandedId(null);
  }

  function handleDeleteOrder(id: string) {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    if (order.status === "active" && deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      return;
    }
    onDeleteOrder(id);
    setDeleteConfirmId(null);
    if (expandedId === id) setExpandedId(null);
  }

  const expandedOrder = expandedId ? annotated.find(o => o.id === expandedId) ?? null : null;

  return (
    <section className="orders-panel">
      <div className="orders-container">

        {/* ── Top bar ──────────────────────────────────────────────────────── */}
        <div className="orders-topbar">
          <div className="orders-topbar-left">
            <h1 className="orders-title">Orders</h1>
            {orders.length > 0 && (
              <span className="orders-count">{countLabel}</span>
            )}
          </div>
          <div className="orders-topbar-right">
            {orders.length > 0 && (
              <div className="orders-search">
                <svg className="orders-search-icon" width="14" height="14" viewBox="0 0 16 16"
                  fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="7" cy="7" r="4.5" />
                  <path d="M10.5 10.5L14 14" />
                </svg>
                <input
                  placeholder="Search vendor, card, tracking…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            )}
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowCreate(true)}
            >
              + New order
            </button>
          </div>
        </div>

        {/* ── Scrollable body ───────────────────────────────────────────────── */}
        <div className="orders-body">

          {orders.length === 0 && (
            <div className="orders-empty-wrap">
              <div className="orders-empty-card">
                <div className="orders-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                    width="28" height="28">
                    <path d="M4 7l8-4 8 4-8 4-8-4z" />
                    <path d="M4 7v10l8 4 8-4V7" />
                    <path d="M12 11v10" />
                  </svg>
                </div>
                <h2>No orders yet</h2>
                <p>
                  Orders track cards you've bought from vendors so they appear in
                  your collection when they arrive.
                </p>
                <div className="orders-empty-actions">
                  <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                    + New order
                  </button>
                  {onOpenBuyList && (
                    <button className="btn" onClick={onOpenBuyList}>
                      Open buy list →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {orders.length > 0 && (
            <>
              <div className="orders-chips">
                {(["active", "received", "cancelled", "all"] as const).map(f => (
                  <button
                    key={f}
                    className={`orders-chip${filter === f ? " active" : ""}`}
                    onClick={() => { setFilter(f); setExpandedId(null); }}
                  >
                    {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                    {" "}<span className="n">{counts[f]}</span>
                  </button>
                ))}
              </div>

              <div className="orders-listmeta">
                {filter === "active" && overdueCount > 0 && (
                  <span className="orders-overdue-meta">
                    ⚠ <span className="num">{overdueCount}</span> order{overdueCount !== 1 ? "s" : ""} overdue
                  </span>
                )}
                <span>
                  <span className="num">{sorted.length}</span> order{sorted.length !== 1 ? "s" : ""}
                  {filter === "active" && cardsInFlight > 0 && (
                    <> · <span className="num">{cardsInFlight}</span> card{cardsInFlight !== 1 ? "s" : ""} in flight</>
                  )}
                  {filter === "active" && activeSpend > 0 && (
                    <span className="orders-spend-meta"> · ${activeSpend.toFixed(2)} tracked</span>
                  )}
                </span>
              </div>

              {sorted.length === 0 ? (
                <div className="orders-filter-empty">
                  {filter === "active" && (search ? "No active orders match your search." : "No active orders.")}
                  {filter === "received" && (search ? "No received orders match your search." : "No received orders yet.")}
                  {filter === "cancelled" && (search ? "No cancelled orders match your search." : "No cancelled orders.")}
                  {filter === "all" && "No orders match your search."}
                </div>
              ) : (
                <div className="ordergrid">
                  {sorted.map(order => (
                    <OCard
                      key={order.id}
                      order={order}
                      decks={decks}
                      isExpanded={expandedId === order.id}
                      isMobile={isMobile}
                      isConfirmingDelete={deleteConfirmId === order.id}
                      onExpand={() => handleExpand(order.id)}
                      onMarkReceived={() => onMarkReceived(order.id)}
                      onMarkCancelled={() => onMarkCancelled(order.id)}
                      onDeleteOrder={() => handleDeleteOrder(order.id)}
                      onConfirmDelete={() => {
                        onDeleteOrder(order.id);
                        setDeleteConfirmId(null);
                        if (expandedId === order.id) setExpandedId(null);
                      }}
                      onCancelDelete={() => setDeleteConfirmId(null)}
                      onReorder={() => handleReorder(order.vendor)}
                      onEdit={() => handleEditOrder(order.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile full-screen detail sheet */}
      {isMobile && expandedOrder && (
        <OrderDetailSheet
          order={expandedOrder}
          decks={decks}
          onClose={() => setExpandedId(null)}
          onMarkReceived={() => { onMarkReceived(expandedOrder.id); setExpandedId(null); }}
          onMarkCancelled={() => { onMarkCancelled(expandedOrder.id); setExpandedId(null); }}
          onDeleteOrder={() => { onDeleteOrder(expandedOrder.id); setExpandedId(null); }}
        />
      )}

      {/* New order sheet (portal, all viewports) */}
      {showCreate && (
        <NewOrderSheet
          orders={orders}
          decks={decks}
          recentVendors={recentVendors}
          defaultVendor={reorderVendor}
          onSubmit={(order, vendor) => {
            onCreateOrder(order, vendor);
          }}
          onClose={() => { setShowCreate(false); setReorderVendor(""); }}
        />
      )}

      {/* Edit order sheet */}
      {editOrderId && (() => {
        const target = orders.find(o => o.id === editOrderId);
        if (!target) return null;
        return (
          <NewOrderSheet
            orders={orders}
            decks={decks}
            recentVendors={recentVendors}
            editOrder={target}
            onSubmit={() => {}}
            onSave={updated => { onUpdateOrder(updated); }}
            onDeleteEdit={() => { onDeleteOrder(editOrderId); }}
            onClose={() => setEditOrderId(null)}
          />
        );
      })()}
    </section>
  );
}
