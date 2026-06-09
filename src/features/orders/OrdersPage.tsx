import { useState, useEffect, useMemo } from "react";
import "./OrdersPage.css";
import type { Order, OrderCard, OrderStatus, Carrier, Deck } from "../../types/index";
import { detectCarrier, getTrackingUrl, CARRIER_NAMES } from "../../utils/carrier";

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

/** Returns the human-readable ETA label and its CSS modifier class. */
function etaInfo(expectedArrival: number | undefined): { label: string; cls: string } | null {
  if (!expectedArrival) return null;
  const d = daysFromNow(expectedArrival);
  if (d < 0) {
    const n = daysOverdue(expectedArrival);
    return { label: `${n} day${n !== 1 ? "s" : ""} overdue`, cls: "late" };
  }
  if (d === 0) return { label: "Arrives today", cls: "warn" };
  if (d === 1) return { label: "Arrives tomorrow", cls: "warn" };
  if (d <= 6) {
    const weekday = new Date(expectedArrival).toLocaleDateString(undefined, { weekday: "long" });
    return { label: `Arrives ${weekday}`, cls: "" };
  }
  return { label: formatShortDate(expectedArrival), cls: "" };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface OrdersPageProps {
  orders: Order[];
  decks: Deck[];
  recentVendors: string[];
  onCreateOrder: (order: Order, vendor: string) => void;
  onMarkReceived: (orderId: string) => void;
  onMarkCancelled: (orderId: string) => void;
  onDeleteOrder: (orderId: string) => void;
  onOpenBuyList?: () => void;
}

// ── OCard component ───────────────────────────────────────────────────────────

interface OCardProps {
  order: Order & { isLate: boolean };
  decks: Deck[];
  isExpanded: boolean;
  isConfirmingDelete: boolean;
  onExpand: () => void;
  onMarkReceived: () => void;
  onMarkCancelled: () => void;
  onDeleteOrder: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}

function OCard({
  order,
  decks,
  isExpanded,
  isConfirmingDelete,
  onExpand,
  onMarkReceived,
  onMarkCancelled,
  onDeleteOrder,
  onConfirmDelete,
  onCancelDelete,
}: OCardProps) {
  const qty = totalQty(order);
  const eta = etaInfo(order.expectedArrival);
  const isLate = order.isLate;
  const isWarnTomorrow = !isLate && eta?.cls === "warn" && daysFromNow(order.expectedArrival ?? 0) === 1;

  // Stripe class / state class
  let stateClass = "";
  if (order.status === "received")  stateClass = "state-ok";
  else if (order.status === "cancelled") stateClass = "state-cancelled state-muted";
  else if (isLate) stateClass = "state-late";
  else if (isWarnTomorrow) stateClass = "state-warn";

  // Order date display
  const orderDateStr = order.orderDate
    ? `Ordered ${formatShortDate(order.orderDate)}`
    : `Added ${formatShortDate(order.createdAt)}`;

  // Tracking tail (last 4 chars)
  const tnTail = order.trackingNumber
    ? `···${order.trackingNumber.replace(/\s/g, "").slice(-4)}`
    : null;

  // Cards grouped by deck for expanded view
  const cardsByDeck = useMemo(() => {
    const groups: Record<string, { deckName: string; cards: OrderCard[] }> = {};
    for (const oc of order.cards) {
      const key = oc.deckId ?? "__freeform__";
      const deck = oc.deckId ? decks.find(d => d.id === oc.deckId) : undefined;
      const deckName = oc.deckId ? (deck?.name ?? "Deleted deck") : "No deck";
      if (!groups[key]) groups[key] = { deckName, cards: [] };
      groups[key].cards.push(oc);
    }
    return groups;
  }, [order.cards, decks]);

  return (
    <div
      className={`ocard ${stateClass}${isExpanded ? " expanded" : ""}`}
      onClick={e => {
        // Don't expand when clicking action buttons
        const target = e.target as HTMLElement;
        if (target.closest("button") || target.closest("a")) return;
        onExpand();
      }}
    >
      {/* Top row: vendor | cards | actions */}
      <div className="ocard-top">
        <div className="ocard-vendor">
          <span className="ocard-vendor-name">{order.vendor}</span>
          <span className="ocard-vendor-sub">{orderDateStr}</span>
        </div>

        <div className="ocard-cards-cell">
          {qty}<span className="lbl"> card{qty !== 1 ? "s" : ""}</span>
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
              onClick={e => { e.stopPropagation(); }}
            >
              Re-order
            </button>
          )}
          <button
            className="ocard-more"
            title="More actions"
            onClick={e => { e.stopPropagation(); onExpand(); }}
          >
            ⋯
          </button>
        </div>
      </div>

      {/* Bottom row: eta | tracking */}
      <div className="ocard-bot">
        <div className="ocard-eta">
          {order.status === "active" && eta ? (
            <>
              <span className={`ocard-eta-when ${eta.cls}`}>{eta.label}</span>
              {isLate && <span className="ocard-pill late">Late</span>}
              {isWarnTomorrow && <span className="ocard-pill warn">Arrives tomorrow</span>}
              {order.expectedArrival && (
                <>
                  <span className="ocard-eta-dot">·</span>
                  <span className="ocard-eta-exp">Expected {formatShortDate(order.expectedArrival)}</span>
                </>
              )}
            </>
          ) : order.status === "received" ? (
            <span className="ocard-eta-when ok">
              Received {formatShortDate(order.createdAt)}
            </span>
          ) : order.status === "cancelled" ? (
            <span className="ocard-eta-when dim">
              Cancelled {formatShortDate(order.createdAt)}
            </span>
          ) : (
            <span className="ocard-eta-when">No expected date</span>
          )}
        </div>

        {order.trackingNumber && order.carrier ? (
          <a
            className="ocard-tracking"
            href={getTrackingUrl(order.trackingNumber, order.carrier)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
          >
            <span className="carrier">{CARRIER_NAMES[order.carrier]}</span>
            {tnTail}
            <span className="arrow">↗</span>
          </a>
        ) : order.status === "active" ? (
          <span className="ocard-tracking-empty">— no tracking</span>
        ) : null}
      </div>

      {/* Expanded detail (Phase 1 stub — full redesign is Phase 2) */}
      {isExpanded && (
        <div className="ocard-detail-stub">
          <div className="ocard-detail-cards">
            {Object.values(cardsByDeck).map(({ deckName, cards }) => (
              <div key={deckName}>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 2, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{deckName}</div>
                {cards.map(oc => (
                  <div key={`${oc.cardId ?? oc.cardName}`} className="ocard-detail-card-item">
                    {oc.quantity}× {oc.cardName}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="ocard-detail-actions">
            {order.status === "active" && (
              <>
                <button className="btn btn-sm btn-quiet ocard-actions btn-recv"
                  onClick={e => { e.stopPropagation(); onMarkReceived(); }}>
                  ✓ Mark received
                </button>
                <button className="btn btn-sm btn-quiet"
                  onClick={e => { e.stopPropagation(); onMarkCancelled(); }}>
                  Cancel order
                </button>
              </>
            )}

            {isConfirmingDelete ? (
              <div className="ocard-delete-confirm">
                <span className="ocard-delete-confirm-text">Delete this order?</span>
                <button className="btn btn-sm btn-ghost" onClick={e => { e.stopPropagation(); onConfirmDelete(); }}>
                  Yes, delete
                </button>
                <button className="btn btn-sm btn-ghost" onClick={e => { e.stopPropagation(); onCancelDelete(); }}>
                  Keep
                </button>
              </div>
            ) : (
              <button className="btn btn-sm btn-ghost" style={{ marginLeft: "auto", color: "var(--danger)" }}
                onClick={e => { e.stopPropagation(); onDeleteOrder(); }}>
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create order form (existing form, lightly restyled) ───────────────────────

interface CreateOrderFormProps {
  decks: Deck[];
  recentVendors: string[];
  onSubmit: (order: Order, vendor: string) => void;
  onClose: () => void;
}

function CreateOrderForm({ decks, recentVendors, onSubmit, onClose }: CreateOrderFormProps) {
  const [vendor, setVendor] = useState("");
  const [tracking, setTracking] = useState("");
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [expected, setExpected] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 5); return d.toISOString().split("T")[0];
  });
  const [notes, setNotes] = useState("");
  const [cards, setCards] = useState<OrderCard[]>([]);
  const [cardSearch, setCardSearch] = useState("");
  const [carrier, setCarrier] = useState<Carrier | "">("");
  const [carrierManual, setCarrierManual] = useState(false);
  const [showShipping, setShowShipping] = useState(false);

  useEffect(() => {
    if (!carrierManual && tracking.trim()) {
      setCarrier(detectCarrier(tracking));
    } else if (!tracking.trim()) {
      setCarrier(""); setCarrierManual(false);
    }
  }, [tracking, carrierManual]);

  const cardResults = cardSearch.trim().length >= 2
    ? decks.flatMap(deck =>
        deck.cards
          .filter(c => c.name.toLowerCase().includes(cardSearch.toLowerCase()))
          .filter(c => !cards.some(oc => oc.cardId === c.id && oc.deckId === deck.id))
          .slice(0, 4)
          .map(c => ({ deckId: deck.id, deckName: deck.name, cardId: c.id, cardName: c.name, maxQty: c.quantity }))
      ).slice(0, 8)
    : [];

  function addCard(deckId: string, _deckName: string, cardId: string, cardName: string, qty: number) {
    setCards(prev => {
      if (prev.some(oc => oc.cardId === cardId && oc.deckId === deckId)) return prev;
      return [...prev, { deckId, cardId, cardName, quantity: qty }];
    });
    setCardSearch("");
  }

  function removeCard(cardName: string, deckId?: string) {
    setCards(prev => prev.filter(oc => !(oc.cardName === cardName && oc.deckId === deckId)));
  }

  function updateQty(cardName: string, deckId: string | undefined, qty: number) {
    if (qty <= 0) { removeCard(cardName, deckId); return; }
    setCards(prev => prev.map(oc =>
      oc.cardName === cardName && oc.deckId === deckId ? { ...oc, quantity: qty } : oc
    ));
  }

  function handleSubmit() {
    if (!vendor.trim() || cards.length === 0) return;
    const newOrder: Order = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      vendor: vendor.trim(),
      trackingNumber: tracking.trim() || undefined,
      carrier: tracking.trim() ? (carrier || detectCarrier(tracking)) || undefined : undefined,
      orderDate: orderDate ? new Date(orderDate).getTime() : undefined,
      expectedArrival: expected ? new Date(expected).getTime() : undefined,
      notes: notes.trim() || undefined,
      status: "active",
      cards,
    };
    onSubmit(newOrder, vendor.trim());
  }

  const pickedTotal = cards.reduce((s, c) => s + c.quantity, 0);
  const groups = cards.reduce<Record<string, OrderCard[]>>((acc, oc) => {
    const key = oc.deckId ?? "__freeform__";
    (acc[key] ??= []).push(oc);
    return acc;
  }, {});

  return (
    <div className="orders-create-wrap">
      <div className="orders-create-title">New order</div>

      {/* Cards field */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="form-label">Cards <span className="form-label-req">required</span></span>
        <div className="card-combobox">
          <input
            className="deck-name-input combobox-input"
            placeholder="Search your decks or type a card name…"
            value={cardSearch}
            onChange={e => setCardSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && cardSearch.trim() && cardResults.length === 0) {
                const name = cardSearch.trim();
                setCards(prev => {
                  const ex = prev.find(c => !c.deckId && c.cardName.toLowerCase() === name.toLowerCase());
                  if (ex) return prev.map(c => c === ex ? { ...c, quantity: c.quantity + 1 } : c);
                  return [...prev, { cardName: name, quantity: 1 }];
                });
                setCardSearch("");
              }
            }}
          />
          <span className="combobox-mode">search</span>
        </div>
        {cardSearch.trim().length >= 2 && (
          <ul className="combobox-results">
            {cardResults.map(r => (
              <li key={`${r.deckId}-${r.cardId}`} className="combobox-result">
                <button type="button" className="combobox-result-btn"
                  onClick={() => addCard(r.deckId, r.deckName, r.cardId, r.cardName, 1)}>
                  <span className="result-name">{r.cardName}</span>
                  <span className="result-deck">{r.deckName} · {r.maxQty}× needed</span>
                  <span className="result-qty-pill">+1</span>
                </button>
              </li>
            ))}
            <li className="combobox-result combobox-result-freeform">
              <button type="button" className="combobox-result-btn"
                onClick={() => {
                  const name = cardSearch.trim();
                  setCards(prev => {
                    const ex = prev.find(c => !c.deckId && c.cardName.toLowerCase() === name.toLowerCase());
                    if (ex) return prev.map(c => c === ex ? { ...c, quantity: c.quantity + 1 } : c);
                    return [...prev, { cardName: name, quantity: 1 }];
                  });
                  setCardSearch("");
                }}>
                <span className="result-name">Add "<b>{cardSearch.trim()}</b>" as freeform card</span>
                <span className="result-qty-pill">+1</span>
              </button>
            </li>
          </ul>
        )}
        {cards.length > 0 && (
          <div className="picked-list">
            {Object.entries(groups).map(([key, grpCards]) => {
              const isFreeform = key === "__freeform__";
              const deck = isFreeform ? null : decks.find(d => d.id === key);
              const groupName = isFreeform ? "Not in a deck" : (deck?.name ?? "Unknown deck");
              const groupCount = grpCards.reduce((s, c) => s + c.quantity, 0);
              return (
                <div key={key} className="picked-group">
                  <div className="picked-group-head">
                    <span className={`picked-group-dot${isFreeform ? " freeform" : ""}`} />
                    <span className="picked-group-name">{groupName}</span>
                    <span className="picked-group-count">{groupCount} card{groupCount !== 1 ? "s" : ""}</span>
                  </div>
                  {grpCards.map(oc => {
                    const d = oc.deckId ? decks.find(x => x.id === oc.deckId) : undefined;
                    const maxQty = oc.cardId ? (d?.cards.find(c => c.id === oc.cardId)?.quantity ?? oc.quantity) : 999;
                    return (
                      <div key={`${oc.deckId ?? "free"}-${oc.cardName}`} className="picked-row">
                        <span className="picked-row-name">{oc.cardName}</span>
                        <div className="picked-row-stepper">
                          <button type="button" className="step-btn"
                            onClick={() => updateQty(oc.cardName, oc.deckId, Math.max(1, oc.quantity - 1))}>−</button>
                          <span className="step-val">{oc.quantity}</span>
                          <button type="button" className="step-btn"
                            onClick={() => updateQty(oc.cardName, oc.deckId, oc.quantity + 1)}
                            disabled={oc.quantity >= maxQty}>+</button>
                        </div>
                        <button type="button" className="picked-row-remove"
                          onClick={() => removeCard(oc.cardName, oc.deckId)}>×</button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Vendor field */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="form-label">Vendor <span className="form-label-req">required</span></span>
        <input className="deck-name-input" placeholder="Pick one or type your own"
          value={vendor} onChange={e => setVendor(e.target.value)} />
        {recentVendors.length > 0 && (
          <div className="vendor-chips">
            {recentVendors.map(v => (
              <button key={v} type="button"
                className={`vendor-chip${vendor === v ? " active" : ""}`}
                onClick={() => setVendor(v)}>{v}</button>
            ))}
          </div>
        )}
      </div>

      {/* Shipping & tracking toggle */}
      {!showShipping ? (
        <button type="button" className="form-collapser" onClick={() => setShowShipping(true)}>
          <span><span className="collapser-add">+</span> Shipping &amp; tracking</span>
          <span className="form-collapser-hint">
            {carrier && carrier !== "other" ? CARRIER_NAMES[carrier as Carrier] : ""}
            {expected ? ` · arrives ${formatShortDate(new Date(expected).getTime())}` : ""}
          </span>
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="form-grid-2">
            <label className="form-field">
              <span className="form-label">Order date</span>
              <input className="deck-name-input" type="date" value={orderDate}
                onChange={e => setOrderDate(e.target.value)} />
            </label>
            <label className="form-field">
              <span className="form-label">Expected arrival</span>
              <input className="deck-name-input" type="date" value={expected}
                onChange={e => setExpected(e.target.value)} />
            </label>
          </div>
          <label className="form-field">
            <span className="form-label">Tracking number</span>
            <input className="deck-name-input" placeholder="Optional"
              value={tracking} onChange={e => setTracking(e.target.value)} />
          </label>
          {tracking.trim() && (
            <label className="form-field">
              <span className="form-label">Carrier</span>
              <select className="deck-name-input"
                value={carrier || "other"}
                onChange={e => { setCarrier(e.target.value as Carrier); setCarrierManual(true); }}>
                {(Object.keys(CARRIER_NAMES) as Carrier[]).map(c => (
                  <option key={c} value={c}>{CARRIER_NAMES[c]}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {/* Notes */}
      <label className="form-field" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="form-label">Notes <span style={{ opacity: 0.6 }}>(optional)</span></span>
        <textarea className="deck-name-input order-notes-textarea"
          style={{ fontFamily: "inherit", resize: "vertical" }}
          placeholder="Optional notes" value={notes}
          onChange={e => setNotes(e.target.value)} rows={2} />
      </label>

      {/* Actions */}
      <div className="order-form-actions">
        <button className="btn btn-primary"
          onClick={handleSubmit}
          disabled={!vendor.trim() || cards.length === 0}>
          Create order{pickedTotal > 0 ? ` · ${pickedTotal} card${pickedTotal !== 1 ? "s" : ""}` : ""}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Discard</button>
      </div>
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────

export function OrdersPage({
  orders,
  decks,
  recentVendors,
  onCreateOrder,
  onMarkReceived,
  onMarkCancelled,
  onDeleteOrder,
  onOpenBuyList,
}: OrdersPageProps) {
  const [filter, setFilter] = useState<OrderStatus | "all">("active");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");

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

  // Count label for header
  const countLabel = filter === "active"
    ? `${counts.active} active`
    : filter === "received"
    ? `${counts.received} received`
    : filter === "cancelled"
    ? `${counts.cancelled} cancelled`
    : `${counts.all} total`;

  // Cards in flight for sub-meta
  const cardsInFlight = useMemo(
    () => annotated.filter(o => o.status === "active").reduce((s, o) => s + totalQty(o), 0),
    [annotated],
  );

  function handleExpand(id: string) {
    setExpandedId(prev => (prev === id ? null : id));
    setDeleteConfirmId(null);
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
              onClick={() => setShowCreate(v => !v)}
            >
              {showCreate ? "Close" : "+ New order"}
            </button>
          </div>
        </div>

        {/* ── Scrollable body ───────────────────────────────────────────────── */}
        <div className="orders-body">

          {/* Create form */}
          {showCreate && (
            <CreateOrderForm
              decks={decks}
              recentVendors={recentVendors}
              onSubmit={(order, vendor) => {
                onCreateOrder(order, vendor);
                setShowCreate(false);
              }}
              onClose={() => setShowCreate(false)}
            />
          )}

          {/* Empty state — no orders ever */}
          {orders.length === 0 && !showCreate && (
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

          {/* List view */}
          {orders.length > 0 && (
            <>
              {/* Chips */}
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

              {/* Sub-meta + overdue warning */}
              <div className="orders-listmeta">
                {filter === "active" && overdueCount > 0 && (
                  <span className="orders-overdue-meta">⚠ {overdueCount} order{overdueCount !== 1 ? "s" : ""} overdue</span>
                )}
                <span>
                  {sorted.length} order{sorted.length !== 1 ? "s" : ""}
                  {filter === "active" && cardsInFlight > 0 && ` · ${cardsInFlight} card${cardsInFlight !== 1 ? "s" : ""} in flight`}
                </span>
              </div>

              {/* Per-filter empty */}
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
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
