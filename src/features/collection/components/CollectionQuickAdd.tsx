import { useState, useRef } from "react";

interface Props {
  onAdd: (name: string, qty: number, foil: boolean) => void;
  onCancel: () => void;
}

export function CollectionQuickAdd({ onAdd, onCancel }: Props) {
  const [name, setName]               = useState("");
  const [qty, setQty]                 = useState(1);
  const [foil, setFoil]               = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlighted, setHighlighted] = useState(-1);
  const [autocompleteError, setAutocompleteError] = useState(false);
  const [successFlash, setSuccessFlash] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef    = useRef<HTMLInputElement>(null);

  async function fetchSuggestions(q: string) {
    if (q.length < 2) { setSuggestions([]); return; }
    try {
      const res  = await fetch(
        `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`
      );
      const data = await res.json() as { data: string[] };
      setSuggestions(data.data?.slice(0, 8) ?? []);
      setAutocompleteError(false);
    } catch {
      setSuggestions([]);
      setAutocompleteError(true);
    }
  }

  function handleInput(val: string) {
    setName(val);
    setHighlighted(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 250);
  }

  function selectSuggestion(s: string) {
    setName(s);
    setSuggestions([]);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted >= 0 && suggestions[highlighted]) {
        selectSuggestion(suggestions[highlighted]);
      } else {
        handleSubmit();
      }
    } else if (e.key === "Escape") {
      if (suggestions.length > 0) {
        setSuggestions([]);      // close dropdown first
      } else {
        onCancel();              // then close form
      }
    }
  }

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSuggestions([]);
    onAdd(trimmed, qty, foil);
    // Reset for next entry (form stays open — LGS multi-card scenario)
    setName("");
    setQty(1);
    setFoil(false);
    // Success flash: --good border for 600ms
    setSuccessFlash(true);
    setTimeout(() => setSuccessFlash(false), 600);
    inputRef.current?.focus();
  }

  return (
    <div className="collection-quick-add">
      <div className="collection-quick-add-row">

        {/* Card name + autocomplete */}
        <div className="collection-quick-add-name-wrap">
          <input
            ref={inputRef}
            className={[
              "field-input collection-quick-add-input",
              successFlash ? "success-flash" : "",
            ].filter(Boolean).join(" ")}
            placeholder="Card name…"
            value={name}
            autoFocus
            onChange={e => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {suggestions.length > 0 && (
            <ul className="collection-quick-add-suggestions" role="listbox">
              {suggestions.map((s, i) => (
                <li
                  key={s}
                  role="option"
                  aria-selected={i === highlighted}
                  className={
                    "collection-quick-add-suggestion" +
                    (i === highlighted ? " highlighted" : "")
                  }
                  onMouseDown={() => selectSuggestion(s)}
                >
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Qty stepper */}
        <div className="collection-quick-add-qty-wrap">
          <button
            className="collection-quick-add-step"
            onClick={() => setQty(q => Math.max(1, q - 1))}
            disabled={qty <= 1}
            tabIndex={-1}
            aria-label="Decrease quantity"
          >−</button>
          <span className="collection-quick-add-qty">{qty}</span>
          <button
            className="collection-quick-add-step"
            onClick={() => setQty(q => q + 1)}
            tabIndex={-1}
            aria-label="Increase quantity"
          >+</button>
        </div>

        {/* Foil toggle */}
        <label className={`collection-quick-add-foil${foil ? " checked" : ""}`}>
          <input
            type="checkbox"
            checked={foil}
            onChange={e => setFoil(e.target.checked)}
          />
          ✦ Foil
        </label>

        {/* Actions */}
        <div className="collection-quick-add-actions">
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={!name.trim()}
          >
            Add
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>

      {/* Autocomplete error — warn not danger; user can still submit */}
      {autocompleteError && (
        <p className="collection-quick-add-error" role="alert">
          ⚠ Autocomplete unavailable — you can still add by name
        </p>
      )}
    </div>
  );
}
