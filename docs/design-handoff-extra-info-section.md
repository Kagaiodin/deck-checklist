# Design Handoff — Extra Info Section

**File:** `design-handoff-extra-info-section.md`  
**Date:** 2026-05-30  
**Priority:** Medium — new section, data enrichment + UI component  
**Effort:** ~1.5–2 hrs (enrichment plumbing + component + CSS)  
**Reference mockup:** `extra-info-section.html` (open in Open Design for live spec with states + annotations)

---

## Summary

A supplementary collapsible section below the card checklist that surfaces two things the user needs to play the deck but which aren't on their fetch list:

1. **Tokens needed** — token cards required by the deck (e.g. Goblin tokens, Treasure tokens, Emblem — Ajani), auto-populated from Scryfall `all_parts` during import.
2. **Alternate printing notes** — cards where the selected printing has a different printed name (e.g. Blightsteel Colossus in SLD prints as "FAS-BOR7 Horus"), so the user knows what to look for at a store.

The section is collapsed by default, toggle state persists to `localStorage`.

| # | What | Where |
|---|---|---|
| 1 | Extend `Deck` type with `extraInfo` | `src/types/index.ts` |
| 2 | Add `SET_EXTRA_INFO` action to store | `src/store/decks.ts` |
| 3 | Collect `all_parts` + `flavor_name` during import enrichment | `src/utils/validator.ts` or `App.tsx` |
| 4 | New `DeckExtraInfo` component | `src/components/DeckExtraInfo.tsx` (new file) |
| 5 | Mount component below card list | `src/components/Checklist.tsx` |
| 6 | Styles | `src/App.css` |

---

## Change 1 — Extend `Deck` type

### File: `src/types/index.ts`

Add the following interfaces:

```ts
export interface DeckToken {
  name: string;
  typeLine: string; // used to determine dot color in the UI
}

export interface DeckAltPrinting {
  cardName: string;  // canonical name, e.g. "Blightsteel Colossus"
  setCode: string;   // e.g. "SLD"
  altName: string;   // printed name on the card, e.g. "FAS-BOR7 Horus"
}

export interface DeckExtraInfo {
  tokens: DeckToken[];
  altPrintings: DeckAltPrinting[];
  enrichedAt: number; // unix ms timestamp of last enrichment run
}
```

Add `extraInfo` to the `Deck` interface:

```ts
export interface Deck {
  // existing fields...
  extraInfo?: DeckExtraInfo;
}
```

---

## Change 2 — Add `SET_EXTRA_INFO` action to store

### File: `src/store/decks.ts`

Add to the action union type:

```ts
| { type: "SET_EXTRA_INFO"; payload: { deckId: string; extraInfo: DeckExtraInfo } }
```

Add to the reducer:

```ts
case "SET_EXTRA_INFO":
  return {
    ...state,
    decks: state.decks.map(d =>
      d.id === action.payload.deckId
        ? { ...d, extraInfo: action.payload.extraInfo }
        : d
    ),
  };
```

---

## Change 3 — Scryfall enrichment

### 3a. Extend `ScryfallCard` interface in `src/utils/validator.ts`

Add two optional fields to the Scryfall card shape (they come back from the `/cards/collection` endpoint):

```ts
interface ScryfallCard {
  // existing fields...
  flavor_name?: string; // alternate printed name on the physical card
  all_parts?: Array<{
    object: "related_card";
    component: "token" | "meld_part" | "meld_result" | "combo_piece";
    name: string;
    type_line: string;
    uri: string;
  }>;
}
```

### 3b. Add `enrichDeckExtraInfo` to `src/utils/validator.ts`

New exported async function. Takes the list of validated cards (with Scryfall UUIDs and set codes already resolved), hits the Scryfall `/cards/collection` endpoint in batches of 75, and returns a `DeckExtraInfo`.

```ts
export async function enrichDeckExtraInfo(cards: Card[]): Promise<DeckExtraInfo> {
  const ids = cards.map(c => ({ id: c.scryfallId })).filter(x => x.id); // guard against missing IDs
  const batches: typeof ids[] = [];
  for (let i = 0; i < ids.length; i += 75) batches.push(ids.slice(i, i + 75));

  const allResults: ScryfallCard[] = [];
  for (const batch of batches) {
    const res = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers: batch }),
    });
    if (!res.ok) continue;
    const data = await res.json();
    allResults.push(...(data.data ?? []));
  }

  // Tokens — deduplicate by name
  const tokenMap = new Map<string, DeckToken>();
  for (const card of allResults) {
    for (const part of card.all_parts ?? []) {
      if (part.component === "token" && !tokenMap.has(part.name)) {
        tokenMap.set(part.name, { name: part.name, typeLine: part.type_line });
      }
    }
  }

  // Alt printings — cards where flavor_name is present
  const altPrintings: DeckAltPrinting[] = allResults
    .filter(c => c.flavor_name)
    .map(c => ({
      cardName: c.name,
      setCode: c.set.toUpperCase(),
      altName: c.flavor_name!,
    }));

  return {
    tokens: Array.from(tokenMap.values()),
    altPrintings,
    enrichedAt: Date.now(),
  };
}
```

> **Note:** `Card.scryfallId` should already be stored from the validation pass. If the field name differs, grep for where the Scryfall UUID is stored on the card object and adjust accordingly.

### 3c. Call enrichment after import in `App.tsx`

After the `SET_CARDS` dispatch that finalises a new deck import, fire the enrichment as a non-blocking promise:

```ts
enrichDeckExtraInfo(importedCards).then(extraInfo => {
  dispatch({ type: "SET_EXTRA_INFO", payload: { deckId: newDeckId, extraInfo } });
});
```

**Idempotent guard:** Skip enrichment if the deck already has `extraInfo?.enrichedAt` set. Only run on initial import for now. Re-enrichment on printing change is a future feature.

---

## Change 4 — New `DeckExtraInfo` component

### File: `src/components/DeckExtraInfo.tsx` (new file)

```tsx
import React, { useState, useEffect } from "react";
import type { DeckExtraInfo as DeckExtraInfoType } from "../types";

interface Props {
  extraInfo: DeckExtraInfoType | undefined;
  isLoading?: boolean;
}

function tokenDotClass(typeLine: string): string {
  if (typeLine.includes("Emblem")) return "ei-dot-emblem";
  if (typeLine.includes("Artifact")) return "ei-dot-artifact";
  if (typeLine.includes("Creature")) return "ei-dot-creature";
  return "ei-dot-copy";
}

const LS_KEY = "fetchlist:extrainfo-open";

export function DeckExtraInfo({ extraInfo, isLoading }: Props) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, open ? "1" : "0"); } catch {}
  }, [open]);

  // Don't render at all while loading and no data yet
  if (!extraInfo && !isLoading) return null;

  const hasTokens = (extraInfo?.tokens.length ?? 0) > 0;
  const hasAltPrintings = (extraInfo?.altPrintings.length ?? 0) > 0;
  const isEmpty = !isLoading && !hasTokens && !hasAltPrintings;

  const summaryParts: string[] = [];
  if (hasTokens) summaryParts.push(`${extraInfo!.tokens.length} token${extraInfo!.tokens.length !== 1 ? "s" : ""}`);
  if (hasAltPrintings) summaryParts.push(`${extraInfo!.altPrintings.length} alt name${extraInfo!.altPrintings.length !== 1 ? "s" : ""}`);

  return (
    <div className="ei-section">
      <button
        className="ei-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className={`ei-chevron${open ? " open" : ""}`}>▶</span>
        <span className="ei-title">Extra Info</span>
        {!open && summaryParts.length > 0 && (
          <span className="ei-summary">
            {summaryParts.map(p => (
              <span key={p} className="ei-badge">{p}</span>
            ))}
          </span>
        )}
      </button>

      {open && (
        <div className="ei-body">
          {isLoading && !extraInfo && (
            <p className="ei-loading">Enriching deck data…</p>
          )}

          {isEmpty && (
            <p className="ei-empty">No tokens or alternate printings found for this deck.</p>
          )}

          {hasTokens && (
            <div className="ei-subsection">
              <div className="ei-sub-label">Tokens needed</div>
              <div className="token-chips">
                {extraInfo!.tokens.map(t => (
                  <span key={t.name} className="token-chip">
                    <span className={`ei-dot ${tokenDotClass(t.typeLine)}`} />
                    {t.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {hasAltPrintings && (
            <div className="ei-subsection">
              <div className="ei-sub-label">Alternate printings</div>
              <div className="alt-print-list">
                {extraInfo!.altPrintings.map(ap => (
                  <div key={`${ap.cardName}-${ap.setCode}`} className="alt-print-row">
                    <span className="alt-print-name">{ap.cardName}</span>
                    <span className="alt-print-edition">{ap.setCode} · {ap.altName}</span>
                    <a
                      className="alt-print-scryfall"
                      href={`https://scryfall.com/search?q=!"${encodeURIComponent(ap.cardName)}"+set:${ap.setCode.toLowerCase()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      ↗
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## Change 5 — Mount in `Checklist.tsx`

Place `<DeckExtraInfo>` immediately after the last card row and before the panel's closing element. Pass the current deck's `extraInfo` and an `isLoading` boolean (derive from a local state flag set during enrichment, or expose it from the store if you prefer).

```tsx
import { DeckExtraInfo } from "./DeckExtraInfo";

// Inside the checklist panel, after the card rows:
<DeckExtraInfo
  extraInfo={deck.extraInfo}
  isLoading={isEnrichmentLoading}
/>
```

---

## Change 6 — Styles in `App.css`

Add the following block. All tokens reference existing CSS variables — no new root tokens needed.

```css
/* ── Extra Info Section ─────────────────────────────────────── */
.ei-section {
  border-top: 1px solid var(--border-dim, #222540);
}

.ei-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}
.ei-toggle:hover { background: var(--surface-2); }
.ei-toggle[aria-expanded="true"] { border-bottom-color: var(--border-dim); }

.ei-chevron {
  font-size: 10px;
  color: var(--text-dim);
  flex-shrink: 0;
  transition: transform 0.18s;
  line-height: 1;
}
.ei-chevron.open { transform: rotate(90deg); }

.ei-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
  flex: 1;
}

.ei-summary { display: flex; align-items: center; gap: 8px; }
.ei-badge {
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 99px;
  padding: 1px 7px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
}

.ei-body {
  padding: 14px 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.ei-loading,
.ei-empty {
  font-size: 12px;
  color: var(--text-dim);
  padding: 4px 0;
}

.ei-subsection { display: flex; flex-direction: column; gap: 0; }
.ei-sub-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 8px;
}

/* Token chips */
.token-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.token-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
  padding: 3px 9px;
  border-radius: 99px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  color: var(--text-muted);
  white-space: nowrap;
}
.ei-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ei-dot-creature { background: #4ade80; }
.ei-dot-artifact { background: var(--text-muted); }
.ei-dot-emblem   { background: #c084fc; }
.ei-dot-copy     { background: #60a5fa; }

/* Alternate printings */
.alt-print-list { display: flex; flex-direction: column; gap: 1px; }
.alt-print-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 5px;
}
.alt-print-row:hover { background: var(--surface-3); }
.alt-print-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.alt-print-edition {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 2;
  min-width: 0;
}
.alt-print-scryfall {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-dim);
  text-decoration: none;
  padding: 2px 5px;
  border-radius: 3px;
  transition: color 0.12s, background 0.12s;
}
.alt-print-scryfall:hover {
  color: var(--accent-light);
  background: var(--accent-dim);
}
```

---

## What does NOT change

- Card row layout — name + set chip + status pill + `⋯` only, no alt name in the row
- Checklist logic, filtering, sorting — untouched
- Any existing token usage in `App.css` — all new selectors are prefixed `.ei-` or `.alt-print-` / `.token-`

---

## Testing checklist

- [ ] Extra Info section renders below the card list for any deck with ≥ 1 card and completed enrichment
- [ ] Section does not render while `extraInfo` is `undefined` and `isLoading` is false (no empty panel flash)
- [ ] Loading state shows "Enriching deck data…" while enrichment is in flight
- [ ] Section is collapsed by default on first render
- [ ] Toggle opens and closes correctly; open state persists across page reload
- [ ] Collapsed state shows summary badges (e.g. "6 tokens · 2 alt names") when there is data
- [ ] Tokens subsection: all unique token names shown with correct dot colors (creature green, artifact muted, emblem purple, other blue)
- [ ] Alt printings subsection: card name + italic set/alt-name + ↗ link; link opens correct Scryfall search in new tab
- [ ] Empty state renders ("No tokens or alternate printings found…") when both subsections have no entries
- [ ] Enrichment only runs once per import; skipped if `deck.extraInfo?.enrichedAt` already set
- [ ] `SET_EXTRA_INFO` does not clobber any other deck field
- [ ] No TypeScript errors; no new `any` casts
- [ ] Light mode — chips and toggle row readable on light surface
- [ ] All accent theme variants — no hard-coded accent colors in this component (uses CSS vars)
- [ ] Mobile (390px) — token chips wrap correctly, alt printing rows don't overflow

---

## Visual reference

Open `extra-info-section.html` in Open Design for:
- **Col 1** — section in context inside a full deck panel, expanded
- **Col 2** — isolated states: collapsed, tokens-only, empty/dimmed
- **Col 3** — design annotations with token dot legend, data model, placement rules, and open questions
