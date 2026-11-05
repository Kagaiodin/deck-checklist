import { useMemo, useState } from "react";
import type { Collection, Deck } from "../../../types/index";
import type { Trade, TradeCard } from "../../../types/trade";
import { sideTotals } from "../../../utils/tradePricing";
import { collectionKey, type LogMeta } from "../../../utils/tradeLedger";
import { TradeSheet } from "../../trade/components/TradeSheet";
import { usd } from "../../trade/format";

interface LogTradeSheetProps {
  trade: Trade;
  collection: Collection;
  decks: Deck[];
  onCancel: () => void;
  /** Called once, on confirm. Nothing is written before this. */
  onConfirm: (meta: LogMeta) => void;
}

const dateInputValue = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** Local noon on the chosen day, so the date never slips across a timezone edge. */
const parseDateInput = (v: string, fallback: number) => {
  const [y, m, d] = v.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d, 12).getTime() : fallback;
};

function ownedTotal(collection: Collection, card: TradeCard): number {
  return (collection[collectionKey(card.name)] ?? []).reduce((n, p) => n + p.quantity, 0);
}
function committedTotal(decks: Deck[], card: TradeCard): number {
  const key = collectionKey(card.name);
  let n = 0;
  for (const deck of decks) for (const c of deck.cards) if (c.acquired && collectionKey(c.name) === key) n += c.quantity;
  return n;
}

/** Confirm step for "Log this trade": the only way a trade changes the Collection. */
export function LogTradeSheet({ trade, collection, decks, onCancel, onConfirm }: LogTradeSheetProps) {
  const [now] = useState(() => Date.now());
  const [counterparty, setCounterparty] = useState("");
  const [date, setDate] = useState(() => dateInputValue(now));
  const [notes, setNotes] = useState("");

  const out = useMemo(() => sideTotals(trade.mine, trade.settings), [trade]);
  const inn = useMemo(() => sideTotals(trade.theirs, trade.settings), [trade]);

  const flags = useMemo(() => {
    const m = new Map<string, { missing: boolean; inDecks: number }>();
    // Copies of one name across several lines are checked together.
    const qtyByKey = new Map<string, number>();
    for (const c of trade.mine.cards) qtyByKey.set(collectionKey(c.name), (qtyByKey.get(collectionKey(c.name)) ?? 0) + c.quantity);
    for (const c of trade.mine.cards) {
      const key = collectionKey(c.name);
      const owned = ownedTotal(collection, c);
      const qty = qtyByKey.get(key) ?? c.quantity;
      const committed = committedTotal(decks, c);
      // Copies left after the trade (never below 0) vs. copies decks need: the shortfall is what decks lose.
      const spare = Math.max(owned - qty, 0);
      m.set(c.id, { missing: owned < qty, inDecks: spare < committed ? committed - spare : 0 });
    }
    return m;
  }, [trade.mine.cards, collection, decks]);

  const inDeckCount = [...flags.values()].filter(f => f.inDecks > 0).length;
  const empty = trade.mine.cards.length + trade.theirs.cards.length === 0 && out.cashTotal + inn.cashTotal === 0
    && trade.mine.cash.length + trade.theirs.cash.length === 0;
  const dateMs = parseDateInput(date, now);

  const line = (c: TradeCard, flagged: boolean) => {
    const f = flags.get(c.id);
    return (
      <li key={c.id} className="lg-line">
        <span className="lg-qty">{c.quantity}×</span>
        <span className="lg-name">{c.name}</span>
        {flagged && f?.missing && <span className="lg-flag">Not in your collection</span>}
        {flagged && f && f.inDecks > 0 && <span className="lg-flag">{f.inDecks} in decks</span>}
      </li>
    );
  };

  return (
    <TradeSheet
      title="Log this trade"
      onClose={onCancel}
      footer={
        <>
          <span className="tr-spacer" />
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={empty}
            onClick={() => onConfirm({ date: dateMs, counterparty, notes })}
          >Log trade</button>
        </>
      }
    >
      <div className="tr-dialog lg-sheet">
        <div className="lg-fields">
          <label className="lg-field">Who with
            <input type="text" value={counterparty} maxLength={80} placeholder="Optional" onChange={e => setCounterparty(e.target.value)} />
          </label>
          <label className="lg-field">Date
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </label>
          <label className="lg-field">Notes
            <input type="text" value={notes} maxLength={200} placeholder="Optional" onChange={e => setNotes(e.target.value)} />
          </label>
        </div>

        <section aria-label="Leaving your collection">
          <h4 className="lg-h">Leaving your collection · {usd(out.total)}</h4>
          <ul className="lg-list">
            {trade.mine.cards.length === 0 && trade.mine.cash.length === 0 && <li className="lg-none">Nothing</li>}
            {trade.mine.cards.map(c => line(c, true))}
            {out.cashTotal > 0 && <li className="lg-line"><span className="lg-name">Cash out</span><span className="lg-flag lg-flag--plain">{usd(out.cashTotal)}</span></li>}
          </ul>
        </section>
        <section aria-label="Arriving in your collection">
          <h4 className="lg-h">Arriving in your collection · {usd(inn.total)}</h4>
          <ul className="lg-list">
            {trade.theirs.cards.length === 0 && trade.theirs.cash.length === 0 && <li className="lg-none">Nothing</li>}
            {trade.theirs.cards.map(c => line(c, false))}
            {inn.cashTotal > 0 && <li className="lg-line"><span className="lg-name">Cash in</span><span className="lg-flag lg-flag--plain">{usd(inn.cashTotal)}</span></li>}
          </ul>
        </section>

        {inDeckCount > 0 && (
          <p className="lg-note" role="note">
            {inDeckCount === 1 ? "A card" : "Some cards"} leaving {inDeckCount === 1 ? "is" : "are"} still in a deck. The deck checklist may show {inDeckCount === 1 ? "it" : "them"} as needed again. Cards you tagged as owned by hand keep that tag.
          </p>
        )}
        <p className="lg-note">Collection updates when you confirm: cards leaving are removed, cards arriving are added.</p>
      </div>
    </TradeSheet>
  );
}
