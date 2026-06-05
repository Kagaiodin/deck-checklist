# Collection Page — Mobile View Implementation Plan

**Feature:** Restructure the Collection page header for mobile (<768px) so the title, stats, search, filters, primary action, and overflow all have room to breathe. Layered on top of [collection-page-redesign-impl.md](./collection-page-redesign-impl.md) — the desktop spec is unchanged.
**Status:** Ready for implementation
**Design source:** `collection-mobile.html` in Open Design project `a0b6c12b-7f1f-4082-aebb-898fa0599033` (3 frames: populated, overflow sheet open, empty)
**Breakpoint:** Applies at `max-width: 767px`. Desktop layout (≥768px) is unchanged.

---

## Why this exists

The desktop Linear-style top bar packs title + count chip + search + 4 filter chips + sort + add + overflow into a single 48px row. On a 390px iPhone viewport that row crams to the point of breaking:

- Search disappears entirely.
- Filter chips carry inline counts (`All 4,337`, `In decks 48`…) and become a wall of numbers.
- Provenance line wraps mid-`<code>` chip.
- The right edge of every row stacks qty + amber `N free` chip, eating ~80px on a narrow viewport.

The fix is **not** to shrink the desktop bar — it's a mobile-specific header layout that gives each concern its own row.

---

## Files to modify

| File | Change |
|---|---|
| `src/features/collection/components/CollectionHeader.tsx` | Add mobile branch: title row + stats line + search-row, hide desktop filter-chip inline counts, render `+ Add` as a FAB instead of inline |
| `src/features/collection/components/CollectionOverflowSheet.tsx` | **New.** Bottom-sheet menu mirroring the existing card-row sheet pattern, holding the actions previously crammed into the top bar |
| `src/features/collection/components/CollectionFab.tsx` | **New.** Floating `+ Add card` action button, mobile-only, fixed bottom-right |
| `src/features/collection/components/CollectionRow.tsx` | Mobile-only: drop the inline amber `N free` chip; tint the qty number amber instead |
| `src/features/collection/CollectionPage.css` | Add `@media (max-width: 767px)` block; add FAB and bottom-sheet styles |

No hook / type / data-shape changes. Reuse the existing bottom-sheet primitive from the card-row work if one exists; otherwise this introduces it for Collection and Decks can adopt it later.

---

## 1. Mobile header — three stacked rows

Replace the single 48px desktop top bar with three rows. All padding `12px 16px` unless noted.

### Row 1 — title + overflow (44px)

```
Collection · 10,566                                          ⋯
```

- Title: `--font-display`, weight 600, 17px.
- Count chip: `· 10,566` — same line, muted color (`var(--text-muted)`), tabular-nums, **no pill background** (the desktop pill reads as visual noise at this size).
- `⋯` overflow: 44×44 hit target, ghost button, opens the bottom sheet (Section 4).
- **No `+ Add` button here** — moves to the FAB (Section 3).
- No search, no sort, no filter chips in this row.

### Row 2 — stats line (32px)

Single muted line directly under the title row:

```
10,566 cards · 4,337 unique · 98 in decks
```

- 12px, `color: var(--text-muted)`, tabular-nums.
- **Provenance demotes to the overflow sheet** (Section 4) — `from collection.csv · 15 days ago` does not appear here. It re-appears as a meta line inside the `Replace CSV` overflow item.
- Hairline border-bottom under this row.

### Row 3 — search + sort (56px)

```
[🔍 Search cards……………………………………]  [↕]
```

- Search input: flex-1, 44px tall, leading magnifier glyph, no shadow, subtle border (`var(--border)`), 14px font.
- Sort button: 44×44 square, ghost, single `↕` glyph (icon-only on mobile to save horizontal room). Tap opens the existing sort menu.
- Hairline border-bottom under this row.

### Row 4 — filter chips (44px, horizontal scroll)

```
[All] [In decks] [Free] [Foils]   →
```

- **Counts stripped** (`All` not `All 4,337`). The count moves to Section 2.
- Pills 28px tall, gap 8px, horizontal scroll with `overflow-x: auto; scroll-snap-type: x mandatory;`. Hide scrollbar.
- Active state matches desktop: accent-tinted background + accent text.
- 12px left/right padding so the first chip aligns with the title.

### Row 5 — count label (28px)

```
SHOWING 4,337 OF 10,566
```

- 11px, uppercase, letter-spacing 0.08em, `color: var(--text-muted)`.
- Tabular-nums.
- Replaces the inline pill counts. Updates as filters change.

---

## 2. Stats / provenance — what moves where

| Item | Desktop location | Mobile location |
|---|---|---|
| `N cards · N unique · N in decks` | Stats line under top bar | **Row 2** under title row |
| `from collection.csv · 15d ago` | Stats line under top bar | **Inside `Replace CSV` overflow item** as a right-aligned meta line |
| Filter counts (`All 4,337` etc) | Inline on each chip | **Row 5 count label** |

---

## 3. Floating `+ Add card` button (FAB)

A persistent primary action, mobile-only.

- **Position:** `position: fixed; right: 16px; bottom: 16px;`. Above the safe-area inset (`env(safe-area-inset-bottom)`).
- **Size:** 56×56, fully rounded, accent fill, `var(--accent-contrast)` glyph, drop shadow (`0 6px 16px color-mix(in oklch, var(--accent) 35%, transparent)`).
- **Glyph:** `+` only (no label, no `Add` text — the icon carries it).
- **Hit target:** 56px is already ≥44 — no expansion needed.
- **Behavior:** opens the same `+ Add card` flow the desktop `+ Add` button opens.
- **Empty state:** FAB is hidden; the empty-state CTAs in the body carry the action instead (Section 5).
- **List padding:** add 88px (`56 + 16 + 16`) of `padding-bottom` to the list container on mobile so the last row isn't permanently obscured by the FAB.

---

## 4. Overflow bottom sheet (`⋯` menu)

Tapping `⋯` in Row 1 opens a bottom sheet (same gesture pattern as the card-row sheet from the prior redesign — backdrop dim, drag-to-dismiss, rounded top corners).

Sheet contents (top to bottom, each row ≥44px tall, 16px horizontal padding):

```
─────────────────────
        ▬▬
Upload CSV
Bulk edit
Replace CSV                    moxfield_haves…csv · 15d
Export
─────────────────────
About this collection
─────────────────────
                  Cancel
```

- Each row uses 14px label on the left, muted 12px meta on the right when present.
- `Replace CSV` shows provenance inline as right-aligned meta (this is where the desktop's stats-line provenance lives on mobile).
- `About this collection` is a new sub-row that opens a small info modal — optional, drop if not needed.
- `Cancel` row at the bottom dismisses the sheet.

---

## 5. Empty state

Header rows 1–3 stay rendered but dim (Row 4 filter chips and Row 5 count label are hidden when there are no cards). FAB is hidden.

Centered in the body:

- Inbox glyph (existing empty-state icon)
- Headline: `Import your collection`
- Body: `Upload a CSV from Moxfield, Archidekt, or another tracker — or add cards one at a time.`
- Two full-width stacked buttons (44px each, 12px gap):
  - `Upload CSV` (accent fill)
  - `+ Add card` (ghost)

The stacked buttons replace the desktop side-by-side pair so each is thumb-reachable.

---

## 6. Row simplification (mobile)

In `CollectionRow`, apply at `<768px`:

- **Drop the right-edge `N free` chip.** Instead, tint the qty number itself amber (`color: var(--warning)`) when `freeCopies > 0`. Keeps the same information density signal without consuming ~40px of right-edge space per row.
- Subtitle line stays as desktop: `N printings · N foil · N decks`, omitting zero segments.
- Tap behavior unchanged (row taps to expand; expansion content is the same as desktop with the in-decks callout leading).

---

## 7. Tokens / CSS additions

```css
@media (max-width: 767px) {
  .collection-header { padding: 0; }
  .collection-header__title-row,
  .collection-header__stats-row,
  .collection-header__search-row {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }
  .collection-header__title-row { padding-bottom: 8px; border-bottom: 0; }
  .collection-header__stats-row { padding-top: 0; }
  .collection-header__filter-row {
    padding: 8px 16px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .collection-header__count-label {
    padding: 8px 16px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }
  .collection-list { padding-bottom: calc(88px + env(safe-area-inset-bottom)); }
  .collection-fab {
    position: fixed;
    right: 16px;
    bottom: calc(16px + env(safe-area-inset-bottom));
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-contrast);
    box-shadow: 0 6px 16px color-mix(in oklch, var(--accent) 35%, transparent);
  }
}
```

---

## Acceptance checklist

### P0
- [ ] At 390px viewport: title row, stats line, search row, filter chips row, count label are all visible without horizontal overflow.
- [ ] Search input is always visible (does not disappear behind a tap-to-reveal).
- [ ] Filter chips no longer carry inline counts; the count label above the list updates as filters change.
- [ ] `+ Add card` is reachable as a FAB; list has bottom padding so the last row is not permanently obscured.
- [ ] `⋯` opens a bottom sheet containing Upload CSV, Bulk edit, Replace CSV (with provenance meta), Export.
- [ ] Provenance string (`from collection.csv · 15d ago`) does not appear in the main header on mobile.
- [ ] Rows do not render the amber `N free` chip on mobile; qty tints amber instead when free copies exist.
- [ ] Empty state hides the FAB and renders two stacked full-width CTAs.

### P1
- [ ] Filter chip row scrolls horizontally without a visible scrollbar.
- [ ] FAB respects `env(safe-area-inset-bottom)` on iPhones with home indicators.
- [ ] Sort button is 44×44 and uses an icon-only glyph on mobile.
- [ ] Bottom sheet supports drag-to-dismiss and backdrop tap-to-dismiss.

### P2
- [ ] `About this collection` info row inside the overflow sheet.
- [ ] Filter chip row uses `scroll-snap` so chips don't stop mid-pill.

---

## Out of scope

- Tablet (768–1023px) layout — desktop spec applies until 768px breakpoint; tablet tuning is a follow-up.
- Row expansion redesign on mobile — uses the same expansion content as desktop; if it overflows on narrow viewports, file a separate ticket.
- Theme system / light mode — covered by the existing theme spec.
- Printing-matching feature — explicitly out of scope per the desktop spec.

---

## References

- `collection-mobile.html` — canonical mobile mockup (populated, overflow sheet open, empty)
- `collection-linear-style.html` — desktop reference
- [collection-page-redesign-impl.md](./collection-page-redesign-impl.md) — desktop implementation plan this layers on top of
- [card-row-contextual-layer-spec.md](./card-row-contextual-layer-spec.md) — existing bottom-sheet pattern to reuse
