import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import "./NewOrderSheet.css";
import type { Order, OrderCard, Carrier, Deck } from "../../types/index";
import { detectCarrier, CARRIER_NAMES } from "../../utils/carrier";

type Step = 1 | 2 | 3 | 4;

interface NewOrderSheetProps {
  orders: Order[];
  decks: Deck[];
  recentVendors: string[];
  defaultVendor?: string;
  editOrder?: Order;
  onSubmit: (order: Order, vendor: string) => void;
  onSave?: (order: Order) => void;
  onDeleteEdit?: () => void;
  onClose: () => void;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function toDateInput(ts: number | undefined): string {
  if (!ts) return "";
  return new Date(ts).toISOString().split("T")[0];
}

export function NewOrderSheet({
  orders, decks, recentVendors, defaultVendor = "",
  editOrder, onSubmit, onSave, onDeleteEdit, onClose,
}: NewOrderSheetProps) {
  const isEdit = !!editOrder;

  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [vendor, setVendor] = useState(editOrder?.vendor ?? defaultVendor);
  const [showCustom, setShowCustom] = useState(false);
  const [customVendor, setCustomVendor] = useState("");

  // Step 2
  const [cards, setCards] = useState<OrderCard[]>(editOrder?.cards ?? []);
  const [cardSearch, setCardSearch] = useState("");
  const [manualMode, setManualMode] = useState(true);

  // Step 3
  const [orderNum, setOrderNum] = useState(() => {
    if (editOrder?.notes) return editOrder.notes.replace(/^Order #/, "");
    return "";
  });
  const [orderDate, setOrderDate] = useState(() =>
    editOrder?.orderDate
      ? toDateInput(editOrder.orderDate)
      : new Date().toISOString().split("T")[0]
  );
  const [tracking, setTracking] = useState(editOrder?.trackingNumber ?? "");
  const [carrier, setCarrier] = useState<Carrier | "">(editOrder?.carrier ?? "");
  const [carrierManual, setCarrierManual] = useState(!!editOrder?.carrier);
  const [expected, setExpected] = useState(() => {
    if (editOrder?.expectedArrival) return toDateInput(editOrder.expectedArrival);
    const d = new Date(); d.setDate(d.getDate() + 5); return d.toISOString().split("T")[0];
  });

  // Confirm delete in edit mode
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    if (!carrierManual && tracking.trim()) {
      setCarrier(detectCarrier(tracking));
    } else if (!tracking.trim()) {
      setCarrier(""); setCarrierManual(false);
    }
  }, [tracking, carrierManual]);

  // Vendor history derived from orders
  const vendorMeta = useMemo(() => {
    const map = new Map<string, { count: number; lastDate: number }>();
    for (const o of orders) {
      const date = o.orderDate ?? o.createdAt;
      const existing = map.get(o.vendor);
      if (existing) {
        existing.count++;
        if (date > existing.lastDate) existing.lastDate = date;
      } else {
        map.set(o.vendor, { count: 1, lastDate: date });
      }
    }
    return map;
  }, [orders]);

  const vendorList = useMemo(() => {
    return [...recentVendors]
      .map(v => ({ name: v, ...( vendorMeta.get(v) ?? { count: 0, lastDate: 0 }) }))
      .sort((a, b) => b.count - a.count);
  }, [recentVendors, vendorMeta]);

  // Card search (deck-based)
  const cardResults = cardSearch.trim().length >= 2
    ? decks.flatMap(deck =>
        deck.cards
          .filter(c => c.name.toLowerCase().includes(cardSearch.toLowerCase()))
          .filter(c => !cards.some(oc => oc.cardId === c.id && oc.deckId === deck.id))
          .slice(0, 4)
          .map(c => ({ deckId: deck.id, deckName: deck.name, cardId: c.id, cardName: c.name }))
      ).slice(0, 8)
    : [];

  function addDeckCard(cardId: string, cardName: string, deckId: string) {
    setCards(prev => {
      if (prev.some(oc => oc.cardId === cardId && oc.deckId === deckId)) return prev;
      return [...prev, { cardId, cardName, deckId, quantity: 1 }];
    });
    setCardSearch("");
  }

  function addFreeform(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCards(prev => {
      const ex = prev.find(c => !c.deckId && c.cardName.toLowerCase() === trimmed.toLowerCase());
      if (ex) return prev.map(c => c === ex ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { cardName: trimmed, quantity: 1 }];
    });
    setCardSearch("");
  }

  function updateQty(idx: number, qty: number) {
    const v = Math.max(1, Math.min(99, qty || 1));
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, quantity: v } : c));
  }

  function updatePrice(idx: number, price: number) {
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, price: price || undefined } : c));
  }

  function removeCard(idx: number) {
    setCards(prev => prev.filter((_, i) => i !== idx));
  }

  function handleCreate() {
    const finalVendor = showCustom ? customVendor.trim() : vendor;
    if (!finalVendor || cards.length === 0) return;
    const order: Order = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      vendor: finalVendor,
      status: "active",
      cards,
      orderDate: orderDate ? new Date(orderDate).getTime() : undefined,
      expectedArrival: expected ? new Date(expected).getTime() : undefined,
      trackingNumber: tracking.trim() || undefined,
      carrier: tracking.trim() ? (carrier as Carrier) || detectCarrier(tracking) || undefined : undefined,
      notes: orderNum.trim() ? `Order #${orderNum.trim()}` : undefined,
    };
    onSubmit(order, finalVendor);
    setStep(4);
  }

  function handleSave() {
    if (!editOrder) return;
    const finalVendor = showCustom ? customVendor.trim() : vendor;
    if (!finalVendor || cards.length === 0) return;
    const updated: Order = {
      ...editOrder,
      vendor: finalVendor,
      cards,
      orderDate: orderDate ? new Date(orderDate).getTime() : undefined,
      expectedArrival: expected ? new Date(expected).getTime() : undefined,
      trackingNumber: tracking.trim() || undefined,
      carrier: tracking.trim() ? (carrier as Carrier) || detectCarrier(tracking) || undefined : undefined,
      notes: orderNum.trim() ? `Order #${orderNum.trim()}` : undefined,
    };
    onSave?.(updated);
    setStep(4);
  }

  const activeVendor = showCustom ? customVendor.trim() : vendor;
  const totalQty = cards.reduce((s, c) => s + c.quantity, 0);
  const totalPrice = cards.reduce((s, c) => s + (c.price ?? 0) * c.quantity, 0);

  const headerSub = step >= 2 && activeVendor
    ? `${activeVendor}${step >= 3 && totalQty > 0 ? ` · ${totalQty} card${totalQty !== 1 ? "s" : ""}` : ""}`
    : undefined;

  const STEPS = [
    { n: 1 as const, label: "Vendor" },
    { n: 2 as const, label: "Cards" },
    { n: 3 as const, label: "Details" },
  ];

  return createPortal(
    <div className="nos-scrim" onClick={onClose}>
      <div className="nos-sheet" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="nos-head">
          <div className="nos-head-ttl">
            <h2 className="nos-title">
              {step === 4
                ? (isEdit ? "Order updated" : "Order created")
                : (isEdit ? "Edit order" : "New order")}
            </h2>
            {headerSub && <span className="nos-vendor-tag">{headerSub}</span>}
          </div>
          <button className="nos-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* ── Stepper ── */}
        {step < 4 && (
          <div className="nos-stepper">
            {STEPS.map((s, i) => {
              const done = step > s.n;
              const cur = step === s.n;
              return (
                <span key={s.n} className="nos-step-group">
                  <span className={`nos-step${done ? " done" : cur ? " current" : ""}`}>
                    <span className="nos-step-num">{done ? "✓" : s.n}</span>
                    {s.label}
                  </span>
                  {i < STEPS.length - 1 && <span className="nos-step-line" />}
                </span>
              );
            })}
          </div>
        )}

        {/* ── Body ── */}
        <div className="nos-body">

          {step === 1 && (
            <>
              <h3 className="nos-body-h">Where did you order from?</h3>
              <p className="nos-body-lede">Select a vendor or enter a new one.</p>

              <div className="nos-vlist">
                {vendorList.map(v => (
                  <button
                    key={v.name}
                    className={`nos-vrow${vendor === v.name && !showCustom ? " selected" : ""}`}
                    onClick={() => { setVendor(v.name); setShowCustom(false); }}
                  >
                    <span className="nos-vmain">
                      <span className="nos-vname">{v.name}</span>
                      {v.count > 0 && <span className="nos-vtag">{v.count} past</span>}
                    </span>
                    <span className="nos-vmeta">
                      {v.lastDate > 0 ? `Last ${fmtDate(v.lastDate)}` : "No past orders"}
                    </span>
                    <span className="nos-radio" />
                  </button>
                ))}

                {showCustom ? (
                  <input
                    className="nos-custom-input"
                    placeholder="Vendor name"
                    value={customVendor}
                    onChange={e => setCustomVendor(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <button
                    className="nos-vendor-other"
                    onClick={() => { setShowCustom(true); setVendor(""); }}
                  >
                    <span className="nos-other-plus">+</span> Other vendor (enter name)
                  </button>
                )}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h3 className="nos-body-h">What's in this order?</h3>

              {/* Source toggle */}
              <div className="nos-source-toggle">
                <button
                  className={`nos-source-btn${!manualMode ? " active" : ""}`}
                  onClick={() => setManualMode(false)}
                >
                  From buy list <span className="nos-source-n">0</span>
                </button>
                <button
                  className={`nos-source-btn${manualMode ? " active" : ""}`}
                  onClick={() => setManualMode(true)}
                >
                  Add manually
                  {cards.length > 0 && <span className="nos-source-n">{cards.length}</span>}
                </button>
              </div>

              {!manualMode ? (
                <div className="nos-buylist-empty">
                  <span className="nos-buylist-empty-icon">☐</span>
                  <p>Your buy list is empty.</p>
                  <p className="nos-buylist-empty-sub">Switch to manual entry to add cards directly.</p>
                  <button className="btn btn-sm btn-ghost" onClick={() => setManualMode(true)}>
                    Add manually →
                  </button>
                </div>
              ) : (
                <>
                  <p className="nos-body-lede">Search your decks or type any card name and press Enter.</p>

                  <div className="nos-search-wrap">
                    <input
                      className="nos-card-search"
                      placeholder="Search card name…"
                      value={cardSearch}
                      onChange={e => setCardSearch(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && cardSearch.trim() && cardResults.length === 0) {
                          addFreeform(cardSearch.trim());
                        }
                      }}
                    />
                    {cardSearch.trim().length >= 2 && (
                      <ul className="nos-results">
                        {cardResults.map(r => (
                          <li key={`${r.deckId}-${r.cardId}`}>
                            <button className="nos-result" onClick={() => addDeckCard(r.cardId, r.cardName, r.deckId)}>
                              <span className="nos-result-name">{r.cardName}</span>
                              <span className="nos-result-sub">{r.deckName}</span>
                              <span className="nos-result-add">+</span>
                            </button>
                          </li>
                        ))}
                        <li>
                          <button className="nos-result nos-result-free" onClick={() => addFreeform(cardSearch.trim())}>
                            <span className="nos-result-name">Add "<b>{cardSearch.trim()}</b>"</span>
                            <span className="nos-result-add">+</span>
                          </button>
                        </li>
                      </ul>
                    )}
                  </div>

                  {cards.length > 0 ? (
                    <div className="nos-cardlist">
                      <div className="nos-cardlist-head">
                        <span>Card</span>
                        <span className="nos-col-right">Qty</span>
                        <span className="nos-col-right">Price</span>
                        <span />
                      </div>
                      {cards.map((c, i) => (
                        <div key={i} className="nos-cardrow">
                          <span className="nos-cardrow-name">{c.cardName}</span>
                          <input
                            className="nos-qty-input"
                            type="number"
                            min="1" max="99"
                            value={c.quantity}
                            onChange={e => updateQty(i, parseInt(e.target.value))}
                          />
                          <div className="nos-price-wrap">
                            <span className="nos-price-pfx">$</span>
                            <input
                              className="nos-price-input"
                              type="number"
                              min="0" step="0.01"
                              value={c.price ?? ""}
                              placeholder="0.00"
                              onChange={e => updatePrice(i, parseFloat(e.target.value))}
                            />
                          </div>
                          <button className="nos-remove" onClick={() => removeCard(i)}>×</button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="nos-cardlist nos-cardlist-placeholder">
                      <div className="nos-cardlist-empty">No cards yet — search above or press Enter to add.</div>
                    </div>
                  )}

                  {totalQty > 0 && (
                    <p className="nos-selsum">
                      {cards.length} line{cards.length !== 1 ? "s" : ""} · {totalQty} card{totalQty !== 1 ? "s" : ""}
                      {totalPrice > 0 && ` · $${totalPrice.toFixed(2)}`}
                    </p>
                  )}
                </>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <h3 className="nos-body-h">Order details</h3>
              <p className="nos-body-lede">All optional — fill in what you have now.</p>

              <div className="nos-field-row">
                <div className="nos-field">
                  <label>Order #</label>
                  <input placeholder="e.g. CK-29841" value={orderNum} onChange={e => setOrderNum(e.target.value)} />
                </div>
                <div className="nos-field">
                  <label>Ordered</label>
                  <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
                </div>
              </div>

              <div className="nos-field-row">
                <div className="nos-field">
                  <label>Tracking #</label>
                  <input placeholder="Optional" value={tracking} onChange={e => setTracking(e.target.value)} />
                </div>
                {tracking.trim() && (
                  <div className="nos-field">
                    <label>Carrier</label>
                    <select value={carrier || "other"} onChange={e => { setCarrier(e.target.value as Carrier); setCarrierManual(true); }}>
                      {(Object.keys(CARRIER_NAMES) as Carrier[]).map(c => (
                        <option key={c} value={c}>{CARRIER_NAMES[c]}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="nos-field">
                <label>Expected arrival</label>
                <input type="date" value={expected} onChange={e => setExpected(e.target.value)} />
              </div>
            </>
          )}

          {step === 4 && (
            <div className="nos-success">
              <div className="nos-success-mark">✓</div>
              <h3 className="nos-success-h">
                {isEdit
                  ? (activeVendor ? `${activeVendor} updated` : "Order updated")
                  : (orderNum ? `${orderNum} created` : "Order created")}
              </h3>
              <p className="nos-success-p">
                {activeVendor} · {totalQty} card{totalQty !== 1 ? "s" : ""}
                {totalPrice > 0 ? ` · $${totalPrice.toFixed(2)}` : ""}
                {!isEdit && expected ? ` · arriving ${fmtDate(new Date(expected).getTime())}` : ""}
              </p>
              <div className="nos-summary-card">
                <div className="nos-sum-row"><span>Vendor</span><span className="nos-sum-v">{activeVendor}</span></div>
                <div className="nos-sum-row"><span>Cards</span><span className="nos-sum-v">{totalQty}</span></div>
                {!isEdit && expected && (
                  <div className="nos-sum-row">
                    <span>Expected</span>
                    <span className="nos-sum-v">{fmtDate(new Date(expected).getTime())}</span>
                  </div>
                )}
                {totalPrice > 0 && (
                  <div className="nos-sum-row">
                    <span>Total</span>
                    <span className="nos-sum-v nos-sum-accent">${totalPrice.toFixed(2)}</span>
                  </div>
                )}
                {tracking && (
                  <div className="nos-sum-row">
                    <span>Tracking</span>
                    <span className="nos-sum-v nos-sum-accent">
                      {carrier ? CARRIER_NAMES[carrier as Carrier] : ""} ···{tracking.replace(/\s/g, "").slice(-4)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* ── Footer ── */}
        <div className="nos-foot">
          {step === 1 && (
            <>
              <span />
              <div className="nos-foot-right">
                <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary btn-sm" disabled={!activeVendor} onClick={() => setStep(2)}>
                  Continue →
                </button>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setStep(1)}>← Back</button>
              <div className="nos-foot-right">
                <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={cards.length === 0}
                  onClick={() => setStep(3)}
                >
                  Continue →
                </button>
              </div>
            </>
          )}
          {step === 3 && !isEdit && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setStep(2)}>← Back</button>
              <div className="nos-foot-right">
                <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleCreate}>
                  Create order ✓
                </button>
              </div>
            </>
          )}
          {step === 3 && isEdit && (
            <>
              {confirmDelete ? (
                <div className="nos-delete-confirm">
                  <span>Delete this order?</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => { onDeleteEdit?.(); onClose(); }}>
                    Yes, delete
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-ghost btn-sm nos-delete-btn"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </button>
              )}
              <div className="nos-foot-right">
                <button className="btn btn-ghost btn-sm" onClick={() => setStep(2)}>← Back</button>
                <button className="btn btn-primary btn-sm" onClick={handleSave}>
                  Save changes ✓
                </button>
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <span />
              <div className="nos-foot-right">
                <button className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
              </div>
            </>
          )}
        </div>

      </div>
    </div>,
    document.body,
  );
}
