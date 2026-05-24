# Design Handoff — Collection Quick-Add

**Issue:** #34  
**Surface:** Collection page — `CollectionHeader` + new `CollectionQuickAdd` component  
**Priority:** High  
**Status:** Ready to implement  
**Complexity:** ~60 min — 4 files touched, no data model changes, no new API endpoints  

---

## What this is

A single-card quick-add form accessible directly from the collection header. Lets users add
cards picked up at a store or trade without opening a CSV or the bulk edit panel.

The bulk edit panel already handles power-user batch adds (paste a decklist). This is the
casual, discoverable path for one card at a time.

---

## UI design

```
┌─ Collection ─────────────────────── 12,450 unique ─┐
│                              [+ Add card] [Bulk edit]│
└──────────────────────────────────────────────────────┘
                          ↓ after clicking "+ Add card"
┌──────────────────────────────────────────────────────┐
│  [🔍 Card name...              ] [Qty: 1] [✦ Foil]   │
│   Lightning Bolt                                      │  ← autocomplete dropdown
│   Lightning Strike                                    │
│   Lightning Helix                                     │
│                                        [Add] [Cancel] │
└──────────────────────────────────────────────────────┘
```

- **Trigger:** `+ Add card` button in `CollectionHeader`, visible at all times
  (empty state and loaded state)
- **Form fields:**
  - Card name — text input with Scryfall autocomplete (debounced 250ms, min 2 chars)
  - Qty — number stepper, default 1, min 1
  - Foil — checkbox toggle
- **Submit:** `Add` button (disabled until a name is typed) or Enter key
- **Success:** form resets to empty, card appears in list (list re-sorts to show it)
- **Error:** inline error below the name field ("Card not found" etc.)
- **Cancel / Escape:** form closes, state cleared

### Empty state behaviour

When no collection is loaded the header shows both `Upload CSV` and `+ Add card`.
Adding the first card programmatically creates the collection (no meta file name —
meta is set to `{ fileName: "Manual entries", importedAt: now, cardCount: 1 }`).

---

## Data flow

```
CollectionQuickAdd
  → onAdd(name: string, qty: number, foil: boolean)
    → CollectionPage.handleQuickAdd()
      → mutateCollection(updated)           // updates localStorage + parent
      → dispatch({ type: "APPLY_COLLECTION", payload: updated })  // re-tags decks
```

`handleQuickAdd` merges into the existing collection the same way `handleIncrement` does,
but accepts an arbitrary quantity and foil flag:

```ts
function handleQuickAdd(name: string, qty: number, foil: boolean) {
  const key = name.toLowerCase();
  const updated = { ...collection };
  const printings = Array.isArray(updated[key]) ? [...updated[key]] : [];

  // Find a matching generic/foil slot to increment, or push a new printing
  const match = printings.findIndex(p =>
    !p.set && !p.collectorNumber && (p.foil ?? false) === foil
  );
  if (match >= 0) {
    printings[match] = { ...printings[match], quantity: printings[match].quantity + qty };
  } else {
    printings.push({ quantity: qty, foil: foil || undefined });
  }
  updated[key] = printings;

  // Bootstrap meta if collection was empty
  if (!collectionMeta) {
    setCollectionMeta({ fileName: "Manual entries", importedAt: Date.now(), cardCount: 1 });
  }

  mutateCollection(updated);
}
```

---

## Implementation

### 1. New component — `src/features/collection/components/CollectionQuickAdd.tsx`

Lifted and adapted from `AddCardRow` in `Checklist.tsx` (lines 163–271).

```tsx
import { useState, useRef } from "react";

interface Props {
  onAdd: (name: string, qty: number, foil: boolean) => void;
  onCancel: () => void;
}

export function CollectionQuickAdd({ onAdd, onCancel }: Props) {
  const [name, setName]           = useState("");
  const [qty, setQty]             = useState(1);
  const [foil, setFoil]           = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlighted, setHighlighted] = useState(-1);
  const [error, setError]         = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function fetchSuggestions(q: string) {
    if (q.length < 2) { setSuggestions([]); return; }
    try {
      const res = await fetch(
        `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`
      );
      const data = await res.json() as { data: string[] };
      setSuggestions(data.data?.slice(0, 8) ?? []);
    } catch {
      setSuggestions([]);
    }
  }

  function handleInput(val: string) {
    setName(val);
    setError(null);
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
      onCancel();
    }
  }

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSuggestions([]);
    onAdd(trimmed, qty, foil);
    // Reset form for next entry
    setName("");
    setQty(1);
    setFoil(false);
    inputRef.current?.focus();
  }

  return (
    <div className="collection-quick-add">
      <div className="collection-quick-add-row">
        <div className="collection-quick-add-name-wrap">
          <input
            ref={inputRef}
            className="field-input collection-quick-add-input"
            placeholder="Card name…"
            value={name}
            autoFocus
            onChange={e => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {suggestions.length > 0 && (
            <ul className="collection-quick-add-suggestions">
              {suggestions.map((s, i) => (
                <li
                  key={s}
                  className={`collection-quick-add-suggestion${i === highlighted ? " highlighted" : ""}`}
                  onMouseDown={() => selectSuggestion(s)}
                >
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="collection-quick-add-qty-wrap">
          <button
            className="collection-quick-add-step"
            onClick={() => setQty(q => Math.max(1, q - 1))}
            disabled={qty <= 1}
            tabIndex={-1}
          >−</button>
          <span className="collection-quick-add-qty">{qty}</span>
          <button
            className="collection-quick-add-step"
            onClick={() => setQty(q => q + 1)}
            tabIndex={-1}
          >+</button>
        </div>

        <label className="collection-quick-add-foil">
          <input
            type="checkbox"
            checked={foil}
            onChange={e => setFoil(e.target.checked)}
          />
          ✦ Foil
        </label>
      </div>

      {error && <p className="collection-quick-add-error">{error}</p>}

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
  );
}
```

---

### 2. `src/features/collection/components/CollectionHeader.tsx`

Add `onQuickAddClick` and `quickAddOpen` props, render the `+ Add card` button:

```tsx
// Add to props interface:
onQuickAddClick: () => void;
quickAddOpen: boolean;

// In the header actions div, add before "Bulk edit":
<button
  className={`btn btn-primary btn-sm${quickAddOpen ? " active" : ""}`}
  onClick={onQuickAddClick}
>
  + Add card
</button>
```

---

### 3. `src/features/collection/CollectionPage.tsx`

```tsx
// Add state:
const [quickAddOpen, setQuickAddOpen] = useState(false);

// Add handler (after handleIncrement):
function handleQuickAdd(name: string, qty: number, foil: boolean) {
  const key = name.toLowerCase();
  const updated = { ...collection };
  const printings = Array.isArray(updated[key]) ? [...updated[key]] : [];
  const match = printings.findIndex(
    p => !p.set && !p.collectorNumber && (p.foil ?? false) === foil
  );
  if (match >= 0) {
    printings[match] = { ...printings[match], quantity: printings[match].quantity + qty };
  } else {
    printings.push({ quantity: qty, foil: foil || undefined });
  }
  updated[key] = printings;
  if (!collectionMeta) {
    setCollectionMeta({ fileName: "Manual entries", importedAt: Date.now(), cardCount: Object.keys(updated).length });
  }
  mutateCollection(updated);
}

// Add import:
import { CollectionQuickAdd } from "./components/CollectionQuickAdd";

// Update CollectionHeader props:
onQuickAddClick={() => setQuickAddOpen(v => !v)}
quickAddOpen={quickAddOpen}

// Render CollectionQuickAdd between CollectionHeader and the error/empty/list sections:
{quickAddOpen && (
  <CollectionQuickAdd
    onAdd={handleQuickAdd}
    onCancel={() => setQuickAddOpen(false)}
  />
)}
```

---

### 4. `src/features/collection/CollectionPage.css`

```css
/* ── Collection quick-add form ──────────────────────────────────── */
.collection-quick-add {
  display: flex; flex-direction: column; gap: 10px;
  padding: 12px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.collection-quick-add-row {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}

.collection-quick-add-name-wrap {
  position: relative; flex: 1; min-width: 160px;
}

.collection-quick-add-input {
  width: 100%; margin: 0 !important;
}

.collection-quick-add-suggestions {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 50;
  list-style: none;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); box-shadow: 0 8px 24px rgba(0,0,0,.4);
  overflow: hidden;
}

.collection-quick-add-suggestion {
  padding: 8px 12px; font-size: 13px; color: var(--text-muted); cursor: pointer;
  border-bottom: 1px solid var(--border);
}
.collection-quick-add-suggestion:last-child { border-bottom: none; }
.collection-quick-add-suggestion:hover,
.collection-quick-add-suggestion.highlighted {
  background: rgba(108,92,231,.1); color: var(--text);
}

.collection-quick-add-qty-wrap {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0;
}

.collection-quick-add-step {
  width: 26px; height: 26px; border-radius: 4px;
  border: 1px solid var(--border); background: var(--surface);
  color: var(--text-muted); font-size: 16px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-family: inherit;
  transition: color .12s, border-color .12s;
}
.collection-quick-add-step:hover:not(:disabled) { color: var(--text); border-color: var(--accent); }
.collection-quick-add-step:disabled { opacity: .35; cursor: default; }

.collection-quick-add-qty {
  font-size: 14px; font-weight: 600; min-width: 20px; text-align: center;
  font-variant-numeric: tabular-nums;
}

.collection-quick-add-foil {
  display: flex; align-items: center; gap: 5px;
  font-size: 13px; color: var(--text-muted); cursor: pointer; flex-shrink: 0;
}
.collection-quick-add-foil input { cursor: pointer; }

.collection-quick-add-error {
  font-size: 12px; color: var(--danger); margin: 0;
}

.collection-quick-add-actions {
  display: flex; gap: 8px;
}
```

---

## Files changed

| File | Change |
|---|---|
| `src/features/collection/components/CollectionQuickAdd.tsx` | **New** — quick-add form with Scryfall autocomplete |
| `src/features/collection/components/CollectionHeader.tsx` | Add `+ Add card` button + props |
| `src/features/collection/CollectionPage.tsx` | Add `quickAddOpen` state, `handleQuickAdd`, render `CollectionQuickAdd` |
| `src/features/collection/CollectionPage.css` | Add `.collection-quick-add` block |

---

## Checklist

- [ ] `+ Add card` button visible in header with no collection loaded (empty state)
- [ ] `+ Add card` button visible with collection loaded
- [ ] Autocomplete fires after 2 chars, debounced 250ms
- [ ] Arrow keys navigate suggestions, Enter selects
- [ ] Escape closes the form
- [ ] Adding a card with qty > 1 correctly merges into an existing generic slot
- [ ] Adding a foil correctly creates a separate `{ foil: true }` slot
- [ ] Adding the same card twice increments quantity, does not create duplicate row
- [ ] First card added with no collection bootstraps `collectionMeta`
- [ ] `APPLY_COLLECTION` fires after every add (deck sync works)
- [ ] Form resets after successful add (ready for next card)
- [ ] Mobile: form is usable at 390px, touch targets ≥ 44px
- [ ] TypeScript: no implicit `any`, no unused vars
