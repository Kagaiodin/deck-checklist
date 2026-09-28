import { useEffect, useRef, useState } from "react";
import { CONDITIONS, CONDITION_MULTIPLIERS, type Condition, type Finish, type TradeCard } from "../../../types/trade";
import { basePriceFor } from "../../../utils/tradePricing";
import { autocomplete, searchPrintings, type Printing } from "../../../utils/scryfallSearch";
import type { SideKey } from "../hooks/useTrade";
import { FINISH_LABEL, usd } from "../format";
import { TradeSheet } from "./TradeSheet";

const DEBOUNCE_MS = 250;

interface CardSearchSheetProps {
  side: SideKey;
  onAdd: (card: Omit<TradeCard, "id">) => void;
  onClose: () => void;
}

export function CardSearchSheet({ side, onAdd, onClose }: CardSearchSheetProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [printings, setPrintings] = useState<Printing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printIdx, setPrintIdx] = useState(0);
  const [finish, setFinish] = useState<Finish>("nonfoil");
  const [condition, setCondition] = useState<Condition>("NM");
  const [quantity, setQuantity] = useState(1);
  // Latest printings request wins; a slow earlier one must not overwrite a newer pick.
  const requestRef = useRef(0);

  // Debounced autocomplete; best-effort (a failed request just shows no suggestions).
  useEffect(() => {
    if (pickedName !== null || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      autocomplete(query, ctrl.signal).then(
        (names) => { setSuggestions(names.slice(0, 6)); setActive(0); },
        () => {}
      );
    }, DEBOUNCE_MS);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query, pickedName]);

  async function choose(name: string) {
    setQuery(name);
    setPickedName(name);
    setSuggestions([]);
    setError(null);
    setPrintings([]);
    setLoading(true);
    const request = ++requestRef.current;
    try {
      const found = await searchPrintings(name);
      if (request !== requestRef.current) return;
      setPrintings(found);
      setPrintIdx(0);
      if (found.length === 0) setError(`No card named “${name}”.`);
      else if (!found[0].finishes.includes(finish)) setFinish(found[0].finishes[0]);
    } catch {
      if (request === requestRef.current) setError("Couldn't reach Scryfall. Check your connection and try again.");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }

  const printing: Printing | undefined = printings[printIdx];
  const activeFinish: Finish = printing && !printing.finishes.includes(finish) ? printing.finishes[0] : finish;
  const base = printing ? basePriceFor(printing.prices, activeFinish) : null;

  function pickPrinting(i: number) {
    setPrintIdx(i);
    const p = printings[i];
    if (!p.finishes.includes(finish)) setFinish(p.finishes[0]);
  }

  function add() {
    if (!printing) return;
    onAdd({
      name: printing.name,
      scryfallId: printing.scryfallId,
      set: printing.set,
      collectorNumber: printing.collectorNumber,
      finish: activeFinish,
      condition,
      quantity,
      imageUrl: printing.imageUrl,
      basePrice: base,
      priceFetchedAt: Date.now(),
      source: "search",
    });
  }

  const sideLabel = side === "mine" ? "My offer" : "Their offer";

  return (
    <TradeSheet
      title={`Add to ${sideLabel}`}
      chip="Scryfall"
      onClose={onClose}
      footer={
        <>
          <span className="tr-note" role="status">
            {loading ? "Loading printings…" : printing ? "Ready — price is fetched with the printing" : "Type at least 2 letters"}
          </span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!printing} onClick={add}>Add card</button>
        </>
      }
    >
      <label className="tr-sr-only" htmlFor="tr-search-q">Card name</label>
      <input
        id="tr-search-q"
        className="tr-text-input"
        autoComplete="off"
        placeholder="Card name…"
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls="tr-search-ac"
        aria-autocomplete="list"
        value={query}
        onChange={(e) => { requestRef.current++; setQuery(e.target.value); setPickedName(null); setPrintings([]); setError(null); setLoading(false); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { setActive((a) => Math.min(suggestions.length - 1, a + 1)); e.preventDefault(); }
          else if (e.key === "ArrowUp") { setActive((a) => Math.max(0, a - 1)); e.preventDefault(); }
          else if (e.key === "Enter") {
            e.preventDefault();
            const name = suggestions[active] ?? query.trim();
            if (name) void choose(name);
          }
        }}
      />
      {suggestions.length > 0 && (
        <ul id="tr-search-ac" className="tr-ac" role="listbox" aria-label="Suggestions">
          {suggestions.map((name, i) => (
            <li key={name} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); void choose(name); }}>{name}</li>
          ))}
        </ul>
      )}

      {error && <p className="tr-note" role="alert" style={{ marginTop: 12 }}>{error}</p>}

      {printings.length > 0 && (
        <>
          <div className="tr-label" style={{ marginTop: 12 }}>Printing · {printings.length} found</div>
          <div className="tr-prints" role="radiogroup" aria-label="Printing">
            {printings.map((p, i) => {
              const price = basePriceFor(p.prices, p.finishes.includes(activeFinish) ? activeFinish : p.finishes[0]);
              return (
                <button
                  key={p.scryfallId}
                  type="button"
                  role="radio"
                  aria-checked={i === printIdx}
                  aria-label={`${p.setName} ${p.set.toUpperCase()} ${p.collectorNumber}`}
                  className="tr-print"
                  onClick={() => pickPrinting(i)}
                >
                  {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" /> : <span className="tr-thumb" aria-hidden="true" />}
                  <span className="tr-set-chip">{p.set.toUpperCase()} · {p.collectorNumber}</span>
                  <span className={`price${price === null ? " price--none" : ""}`}>{price === null ? "No price" : usd(price)}</span>
                </button>
              );
            })}
          </div>

          {printing && (
            <div className="tr-pick-row">
              <span className="tr-seg" role="group" aria-label="Finish">
                {(["nonfoil", "foil", "etched"] as Finish[]).map((f) => (
                  <button key={f} type="button" aria-pressed={f === activeFinish} disabled={!printing.finishes.includes(f)} onClick={() => setFinish(f)}>{FINISH_LABEL[f]}</button>
                ))}
              </span>
              <select className="tr-select" aria-label="Condition" value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
                {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <span className="tr-stepper" role="group" aria-label="Quantity">
                <button type="button" aria-label="Decrease" disabled={quantity <= 1} onClick={() => setQuantity((q) => q - 1)}>−</button>
                <input readOnly aria-label="Quantity" value={quantity} />
                <button type="button" aria-label="Increase" disabled={quantity >= 99} onClick={() => setQuantity((q) => q + 1)}>+</button>
              </span>
              <span className="tr-spacer" />
              <span className="tr-mono" style={{ fontWeight: 700 }}>{base === null ? "No price" : usd(base * CONDITION_MULTIPLIERS[condition])}</span>
            </div>
          )}
        </>
      )}
    </TradeSheet>
  );
}
