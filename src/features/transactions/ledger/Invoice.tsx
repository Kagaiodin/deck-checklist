import { useEffect, useRef, useState } from "react";
import type { TradeLogCard, TradeLogEntry } from "../../../types/trade";
import { ledgerEntryToText } from "../../../utils/tradeLedger";
import { usd } from "../../trade/format";

interface InvoiceProps {
  entry: TradeLogEntry;
  onBack: () => void;
}

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const FINISH: Record<string, string> = { nonfoil: "", foil: " · Foil", etched: " · Etched" };

export function Invoice({ entry, onBack }: InvoiceProps) {
  const [status, setStatus] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ledgerEntryToText(entry));
      setStatus("Copied to clipboard as plain text.");
    } catch {
      setStatus("Could not copy. Select the invoice and copy it manually.");
    }
  };

  const { cash, totals } = entry;
  return (
    <div className="inv-wrap">
      <div className="inv-bar">
        <button type="button" className="btn btn-ghost btn-sm ledger-back" onClick={onBack}>← Back to entry</button>
        <span className="spacer" />
        <button type="button" className="btn btn-secondary" onClick={copy}>Copy as text</button>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print</button>
      </div>
      <p className="inv-status" role="status">{status}</p>
      <div className="paper-sheet" role="document" aria-label="Trade invoice">
        <h2 ref={heading} tabIndex={-1}>Trade invoice</h2>
        <div className="inv-meta">
          <div><span>Date</span>{fmtDate(entry.date)}</div>
          {entry.counterparty && <div><span>With</span>{entry.counterparty}</div>}
        </div>
        {entry.cardsOut.length > 0 && <CardTable caption="Cards you gave" cards={entry.cardsOut} />}
        {entry.cardsIn.length > 0 && <CardTable caption="Cards you got" cards={entry.cardsIn} />}
        <div className="inv-tot">
          {(entry.cardsOut.length > 0 || cash.out > 0) && <><span>Given</span><span className="num">{usd(totals.out)}</span></>}
          {(entry.cardsIn.length > 0 || cash.in > 0) && <><span>Received</span><span className="num">{usd(totals.in)}</span></>}
          {cash.out > 0 && <><span>Cash given</span><span className="num">{usd(cash.out)}</span></>}
          {cash.in > 0 && <><span>Cash received</span><span className="num">{usd(cash.in)}</span></>}
        </div>
        {entry.notes && <p className="inv-notes">Notes: {entry.notes}</p>}
        <p className="fine">Prices are per-card prices at the time this trade was logged.</p>
      </div>
    </div>
  );
}

function CardTable({ caption, cards }: { caption: string; cards: TradeLogCard[] }) {
  return (
    <table className="inv-table">
      <caption>{caption}</caption>
      <thead>
        <tr><th scope="col">Card</th><th scope="col">Qty</th><th scope="col">Unit</th><th scope="col">Total</th></tr>
      </thead>
      <tbody>
        {cards.map((c, i) => (
          <tr key={i}>
            <td>{c.name}<span className="sub">{c.set.toUpperCase()} {c.collectorNumber}{FINISH[c.finish]} · {c.condition}</span></td>
            <td>{c.quantity}</td>
            <td>{c.unitPrice === null ? "no price" : usd(c.unitPrice)}</td>
            <td>{c.unitPrice === null ? "no price" : usd(c.unitPrice * c.quantity)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
