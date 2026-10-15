# Implementation Spec — Collection Quick-Add

**Issue:** #34  
**Feature branch:** `feature/34-collection-quick-add`  
**Surface:** Collection page — `CollectionHeader` + new `CollectionQuickAdd` component  
**Status:** Ready to implement — awaiting UX spec ✅ (now in `README.md`)  
**Complexity:** ~60–90 min — 4 files touched, no data model changes, no new API endpoints

---

## ⚠️ Spec delta — design vs. implementation

The implementation spec in `docs/design_handoff_collection_quick_add.md` and the design spec (`README.md`) have four discrepancies. **The design spec wins in all cases.** These are the exact lines to fix before shipping:

| # | Location | Implementation spec says | Design spec says (correct) |
|---|---|---|---|
| 1 | `CollectionPage.css` — `.collection-quick-add-error` | `color: var(--danger)` | `color: var(--warn)` — user can still submit; red implies blocking |
| 2 | `CollectionQuickAdd.tsx` — `handleSubmit` | No post-add feedback | Add 600ms `var(--good)` border flash on the name input (see §8 in `README.md`) |
| 3 | `CollectionQuickAdd.tsx` — `<button>` stepper elements | No ARIA labels | Add `aria-label="Decrease quantity"` / `aria-label="Increase quantity"` |
| 4 | `CollectionPage.css` — `.collection-quick-add-actions` (mobile) | Not specified | `@media (max-width: 639px)`: `flex-direction: row-reverse` — Add button on far right |

Additionally, the CSS block in the implementation spec is missing:
- entrance animation (`max-height + opacity` transition — see `README.md §4`)
- `btn-primary.active` focus ring on the header button
- mobile override block for the name-wrap full-width row and action reversal

All of these are specified precisely in `README.md`. Use it as the visual source of truth; use this doc for the code structure.

---

## What this is

A single-card quick-add form that slides open below the collection stats strip when the user taps **+ Add card**. Designed for the casual LGS-purchase case ("I bought 2 Sol Rings and a Brainstorm") — not a replacement for the bulk edit panel.

The bulk edit panel handles power-user batch adds (paste a decklist). This is the casual, discoverable path for one card at a time.

---

## Data flow

```
CollectionQuickAdd
  → onAdd(name: string, qty: number, foil: boolean)
    → CollectionPage.handleQuickAdd()
      → mutateCollection(updated)           // updates localStorage + parent state
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
    setCollectionMeta({
      fileName: "Manual entries",
      importedAt: Date.now(),
      cardCount: Object.keys(updated).length,
    });
  }

  mutateCollection(updated);
}
```

---

## Implementation

### 1. New component — `src/features/collection/components/CollectionQuickAdd.tsx`

Lifted and adapted from `AddCardRow` in `Checklist.tsx` (lines 163–271). Key additions over the checklist version: success flash, ARIA labels on steppers, Escape routing through `onCancel`.

```tsx
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
            ].join(" ")}
            placeholder="Card name…"
            value={name}
            autoFocus
            onChange={e => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {suggestions.length > 0 && (
            <ul
              className="collection-quick-add-suggestions"
              role="listbox"
            >
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

      {/* Autocomplete error — warn, not danger; user can still submit */}
      {autocompleteError && (
        <p className="collection-quick-add-error" role="alert">
          ⚠ Autocomplete unavailable — you can still add by name
        </p>
      )}
    </div>
  );
}
```

---

### 2. `src/features/collection/components/CollectionHeader.tsx`

Add `onQuickAddClick` and `quickAddOpen` props; render `+ Add card` to the **left** of "Bulk edit":

```tsx
// Add to props interface:
onQuickAddClick: () => void;
quickAddOpen: boolean;

// In .collection-header-actions, insert before "Bulk edit":
<button
  className={`btn btn-primary btn-sm${quickAddOpen ? " active" : ""}`}
  onClick={onQuickAddClick}
>
  + Add card
</button>
```

The `.active` class applies `box-shadow: 0 0 0 2px var(--accent-light)` (see CSS block §4 below) to signal the form is open below.

---

### 3. `src/features/collection/CollectionPage.tsx`

```tsx
// Import:
import { CollectionQuickAdd } from "./components/CollectionQuickAdd";

// State:
const [quickAddOpen, setQuickAddOpen] = useState(false);

// Handler (add after handleIncrement):
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
    setCollectionMeta({
      fileName: "Manual entries",
      importedAt: Date.now(),
      cardCount: Object.keys(updated).length,
    });
  }
  mutateCollection(updated);
}

// Pass to CollectionHeader:
onQuickAddClick={() => setQuickAddOpen(v => !v)}
quickAddOpen={quickAddOpen}

// Render between CollectionHeader (+ stats strip) and the error/filter/list area:
{quickAddOpen && (
  <CollectionQuickAdd
    onAdd={handleQuickAdd}
    onCancel={() => setQuickAddOpen(false)}
  />
)}
```

---

### 4. `src/features/collection/CollectionPage.css`

Add this block. Replaces the incomplete version in the original implementation spec — this version includes the entrance animation, mobile override, focus-ring for the active header button, and the corrected warning color.

```css
/* ── Collection quick-add form ──────────────────────────────────── */

/* Header button active ring */
.btn-primary.active {
  box-shadow: 0 0 0 2px var(--accent-light);
}

/* Form container — entrance animation */
.collection-quick-add {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  animation: qa-enter 180ms ease-out both;
}

@keyframes qa-enter {
  from { opacity: 0; max-height: 0; overflow: hidden; }
  to   { opacity: 1; max-height: 120px; }
}

.collection-quick-add-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.collection-quick-add-name-wrap {
  position: relative;
  flex: 1;
  min-width: 160px;
}

.collection-quick-add-input {
  width: 100%;
  margin: 0 !important;
}

/* Success flash — applied via JS className toggle */
.collection-quick-add-input.success-flash {
  border-color: var(--good);
  transition: border-color 0.6s ease;
}

/* Autocomplete dropdown */
.collection-quick-add-suggestions {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 50;
  list-style: none;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgba(0,0,0,.4);
  overflow: hidden;
}

.collection-quick-add-suggestion {
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-muted);
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}
.collection-quick-add-suggestion:last-child { border-bottom: none; }
.collection-quick-add-suggestion:hover,
.collection-quick-add-suggestion.highlighted {
  background: rgba(108,92,231,.1);
  color: var(--text);
}

/* Qty stepper */
.collection-quick-add-qty-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.collection-quick-add-step {
  width: 26px;
  height: 26px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 16px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-family: inherit;
  transition: color .12s, border-color .12s;
}
.collection-quick-add-step:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--accent);
}
.collection-quick-add-step:disabled { opacity: .35; cursor: default; }

.collection-quick-add-qty {
  font-size: 14px;
  font-weight: 600;
  min-width: 20px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* Foil label */
.collection-quick-add-foil {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
}
.collection-quick-add-foil input { cursor: pointer; accent-color: var(--accent); }
.collection-quick-add-foil.checked { color: var(--accent-light); }

/* Action buttons */
.collection-quick-add-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* Error / warning — warn, NOT danger, because add is still possible */
.collection-quick-add-error {
  font-size: 12px;
  color: var(--warn);    /* ← was var(--danger) in the original spec — corrected */
  margin: 0;
  display: flex;
  align-items: center;
  gap: 5px;
}

/* Mobile (≤ 639px) */
@media (max-width: 639px) {
  .collection-quick-add {
    padding: 10px 12px;
  }
  .collection-quick-add-name-wrap {
    flex: 0 0 100%;        /* full width on its own row */
    min-width: 0;
  }
  .collection-quick-add-input {
    min-height: 44px;      /* touch target */
  }
  .collection-quick-add-step {
    width: 36px;           /* touch target */
    height: 36px;
  }
  .collection-quick-add-foil {
    min-height: 44px;
    align-items: center;
  }
  .collection-quick-add-actions {
    margin-left: auto;     /* push to right edge */
    flex-direction: row-reverse; /* Add on far right, thumb-reachable */
  }
}
```

---

## Files changed

| File | Change |
|---|---|
| `src/features/collection/components/CollectionQuickAdd.tsx` | **New** — quick-add form with Scryfall autocomplete, success flash, ARIA labels |
| `src/features/collection/components/CollectionHeader.tsx` | Add `+ Add card` button + `quickAddOpen` / `onQuickAddClick` props |
| `src/features/collection/CollectionPage.tsx` | Add `quickAddOpen` state, `handleQuickAdd`, render `CollectionQuickAdd` |
| `src/features/collection/CollectionPage.css` | Add `.collection-quick-add` block (entrance animation, mobile overrides, corrected warn color) |

---

## Acceptance checklist

### Functional (from implementation spec)
- [ ] `+ Add card` button visible in header with no collection loaded (empty state)
- [ ] `+ Add card` button visible with collection loaded
- [ ] Autocomplete fires after 2 chars, debounced 250ms
- [ ] Arrow keys navigate suggestions; Enter selects highlighted or submits
- [ ] Escape: closes dropdown if open; closes form if no dropdown
- [ ] Adding a card with qty > 1 correctly merges into an existing generic slot
- [ ] Adding a foil correctly creates a separate `{ foil: true }` slot
- [ ] Adding the same card twice increments quantity, does not create a duplicate row
- [ ] First card added with no collection bootstraps `collectionMeta` with `fileName: "Manual entries"`
- [ ] `APPLY_COLLECTION` fires after every add (deck sync works)
- [ ] Form resets after successful add (stays open for next card)
- [ ] Mobile: form is usable at 390px, touch targets ≥ 44px
- [ ] TypeScript: no implicit `any`, no unused vars

### Design (from design spec README.md §14)
- [ ] Form entrance animation: `opacity + max-height` over 180ms ease-out
- [ ] Input auto-focuses on form open (no click needed)
- [ ] Success border flash: `var(--good)` for 600ms on name input after add
- [ ] Foil label color changes to `var(--accent-light)` when checked
- [ ] Focus returns to `+ Add card` button on Cancel or Escape
- [ ] Suggestions dropdown closes on outside click (form stays open)
- [ ] Mobile: name input is full width on its own row; actions row right-aligned
- [ ] Mobile: Add button on far right (row-reverse order)
- [ ] `role="alert"` on error element for screen reader announcement
- [ ] Stepper `−`/`+` buttons have `aria-label` values
- [ ] `+ Add card` button shows `box-shadow: 0 0 0 2px var(--accent-light)` ring when form is open
- [ ] Error color is `var(--warn)` (amber), not `var(--danger)` (red)
