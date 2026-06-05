# Collection Page Redesign — Implementation Plan

**Feature:** Align the Collection page with the redesigned Decks page using the Linear-style compact layout.
**Status:** Ready for implementation
**Design source:** `collection-linear-style.html` in Open Design project `a0b6c12b-7f1f-4082-aebb-898fa0599033`
**Related decisions (from chat):**
- Collection is a *reference/inventory* surface (not task-tracking) — no checkboxes, no progress bars, no "need to buy" pills.
- The headline question is **"do I own this card"**, not "do I own this printing." Printings are secondary metadata.
- "In decks" usage is the most valuable read in the expanded state and must lead the expansion, matching the production brand-tinted callout.

---

## Files to modify

| File | Change |
|---|---|
| `src/features/collection/CollectionPage.tsx` | Replace the current header + controls layout with the new top-bar + stats-line structure |
| `src/features/collection/components/CollectionHeader.tsx` | Rewrite — fold title, count chip, search, filter chips, sort, add, overflow into a single 48px top bar |
| `src/features/collection/components/CollectionControls.tsx` | Merge into the new top bar (filter chips + sort) or delete if fully absorbed |
| `src/features/collection/components/CollectionRow.tsx` | New 52px row anatomy: rarity stripe, name + subtitle, qty on right, optional `N free` chip |
| `src/features/collection/components/CollectionRowDetail.tsx` | Lead with brand-tinted "in decks" callout; demote printings to a labeled `PRINTINGS · N` section |
| `src/features/collection/CollectionPage.css` | New tokens, new layout |

Hooks (`useCollectionStats`, `useCollectionSort`, `useCollectionFilter`) and types (`src/types/collection.ts`) do not need to change — the data shape is unchanged. The `in-decks` data already exists; this redesign exposes it more prominently.

---

## 1. Top bar (48px)

Replace the existing two-row header (title row + 3-cell stats strip + provenance line) with a single 48px top bar:

```
[Collection]  [1,247]   [🔍 Search cards……………]  [All 312] [In decks 843] [Free 404] [Foils 87]   [Sort ↕]  [+ Add]  [⋯]
```

Specs:
- Height: 48px, hairline border-bottom (`var(--border)`).
- Title: existing `--font-display`, weight 600, 16px.
- Count chip immediately after title: muted background, tabular-nums, padding `2px 8px`, 12px font, border-radius 4px.
- Search input: subtle border, no shadow, inline magnifier glyph on the left, ~280px width, expands on focus. No filled background.
- Filter chips: pill shape, 28px tall, tabular-num count appended (`All 312`). Active state = accent-tinted background (`color-mix(in oklch, var(--accent) 12%, transparent)`) + accent text. Horizontally scrollable if they overflow on narrow viewports.
- Sort button: ghost, label `Sort` + `↕` glyph.
- Add button: accent fill, label `+ Add`.
- Overflow `⋯` button: ghost, opens menu with `Upload CSV`, `Replace CSV`, `Export`, `Bulk edit`.

Mobile (<768px): collapse the filter chips into a horizontal scroll row beneath the top bar; keep title, count chip, search (compact), `+ Add`, `⋯` on the first row.

---

## 2. Stats / provenance line

Single muted row directly below the top bar, no boxes:

```
1,247 cards · 312 unique · 843 in decks · from collection.csv · 3 days ago
```

- 13px, `color: var(--text-muted)`.
- Tabular-nums on numbers.
- `collection.csv` rendered in `<code>` styling (subtle mono pill).
- Relative time string uses existing formatter.
- Padding `8px 16px`. Hairline border-bottom.

Kill the old 3-cell stat strip and the separate "From … · 2d ago · Replace CSV" line. Replace CSV moves into the `⋯` overflow.

---

## 3. Row (52px)

Replace `CollectionRow` with:

```
[3px rarity stripe] [Card Name]                                  [3×]
                    [2 printings · 1 foil · 3 decks]            [1 free]
```

- Height: 52px collapsed.
- 3px rarity stripe flush to the viewport left edge (no inset). Override stripe color to amber (`var(--warning)`) when the card has free copies (i.e. `freeCopies > 0`).
- Name: 14px, weight 500.
- Subtitle: 12px muted, format `N printings · N foil · N decks`. Omit each segment when its count is 0.
- Qty: right-aligned, tabular-nums, bold, 14px.
- Small amber `N free` chip to the left of qty when `freeCopies > 0`.
- Alternating row backgrounds: even rows `transparent`, odd rows `color-mix(in oklch, var(--surface) 60%, transparent)`.
- Hover: subtle background lift; name color → accent.
- Whole row click toggles expansion (no chevron icon required; preserve existing keyboard support).

Mobile: identical layout; tap to expand.

---

## 4. Expanded state (`CollectionRowDetail`)

Re-order the expansion so the in-decks callout leads. Demote printings.

```
┌─────────────────────────────────────────────────────────────┐
│ → 4 in decks                                                │
│   Atraxa Superfriends (1) · Aloy, Savior of Meridian (1) ·  │
│   Edgar Markov Vampires (1) · Krenko Goblin Tribal (1)      │
├─────────────────────────────────────────────────────────────┤
│ PRINTINGS · 2                                               │
│   4×   CMR · #472 · non-foil                          Edit  │
│   2×   2X2 · #383 · foil                              Edit  │
├─────────────────────────────────────────────────────────────┤
│   + Add copy   + Printing                       Remove all  │
└─────────────────────────────────────────────────────────────┘
```

- **In-decks callout (top):** brand-tinted background (`color-mix(in oklch, var(--accent) 8%, transparent)`), accent left-border 2px, uppercase eyebrow `→ N in decks`, deck list below with linked deck names + qty in muted parens. Hide entirely when the card is in 0 decks.
- **`PRINTINGS · N` label:** small uppercase eyebrow, muted, 11px, tracking 0.06em.
- **Printing rows:** `[qty ×] [SET · #collector · foil/non-foil]  [Edit]`. Use the existing chip vocabulary from Decks (set code + rarity dot) — chips ON per the latest agreed direction. Rows are quiet (no left stripe, no alternating background). `Edit` is a ghost link on the right.
- **Action bar (bottom):** `+ Add copy` (accent ghost) · `+ Printing` (ghost) on the left, `Remove all` (muted-danger ghost) on the right.
- Expansion uses the same accent-tinted drawer treatment as the design mock (subtle border-top + border-bottom inside the parent row group).

---

## 5. Empty state

Centered layout below the top bar (top bar stays visible and active):

- Inbox glyph (existing icon), 48px, muted.
- Headline: "No cards yet" — 18px, weight 600.
- Body: "Import your collection from Moxfield or add cards manually." — 14px muted.
- Side-by-side buttons: `Upload CSV` (accent fill) + `+ Add card` (ghost).

Mobile: same layout, buttons stack vertically.

---

## 6. Alpha rail

Keep the existing alpha rail behavior but restyle:
- Width: 22px, flush to the right edge of the list viewport.
- Letters: 11px, muted, weight 500, evenly distributed.
- Active letter: accent text.
- Hide entirely below 768px.

---

## 7. Tokens

Confirm or add to `src/styles/tokens.css`:

```css
--accent: oklch(64% 0.18 285);  /* existing brand violet */
--accent-tint-8:  color-mix(in oklch, var(--accent) 8%, transparent);
--accent-tint-12: color-mix(in oklch, var(--accent) 12%, transparent);
--warning: oklch(78% 0.14 75);  /* amber for free-copies indicator */
--text-muted: #9ba5c9;  /* canonical, per memory */
--border: oklch(28% 0.02 270 / 0.6);
```

Use existing `--danger: #e05353` for `Remove all`.

---

## 8. Acceptance checklist

P0 (must pass before merging):
- [ ] Top bar height is exactly 48px; all controls render on one row at ≥1024px.
- [ ] Filter chips show live counts and the active chip uses accent tint, not solid fill.
- [ ] Stats line is one row, no boxes, includes provenance + relative time.
- [ ] Row is 52px collapsed; rarity stripe flush left; qty right-aligned tabular-nums.
- [ ] Free indicator: amber chip appears only when `freeCopies > 0` and stripe overrides to amber.
- [ ] Expansion leads with the in-decks callout when `inDecks.length > 0`; hidden otherwise.
- [ ] Printings section labeled `PRINTINGS · N` and lives below the callout.
- [ ] Action bar: Add copy / Add printing on the left, Remove all on the right (muted danger).
- [ ] Empty state renders top bar normally and centers the empty block.
- [ ] Alpha rail hidden below 768px.
- [ ] Light mode: all tokens resolve correctly; no naive invert filters anywhere.

P1:
- [ ] Filter chip row is horizontally scrollable on mobile without horizontal page scroll.
- [ ] Search expands smoothly on focus; does not push other controls below it.
- [ ] Overflow `⋯` menu contains: Upload CSV, Replace CSV, Export, Bulk edit.
- [ ] Row expansion animates open/closed (existing motion tokens).
- [ ] In-decks deck names are linked to their deck routes.

P2:
- [ ] Keyboard: row Enter/Space toggles expansion; Tab order through top bar is left-to-right.
- [ ] Reduced-motion users get instant expansion.

---

## 9. Out of scope

- Direct printing-matching feature (user has it planned but not for this pass).
- Theme system / light mode redesign (covered separately by [[fetchlist-themes-direction]]).
- Bulk edit panel internals (no changes; just relocate its entry point into the overflow menu).
- Quick-add panel (`CollectionQuickAdd`) internals — leave as-is, but it should open from the `+ Add` button, not as an always-inline panel.

---

## 10. Reference

- Visual source of truth: `collection-linear-style.html` (latest revision, includes Dark Ritual single-deck expansion and Sol Ring multi-deck expansion).
- Header alignment reference: `collection-header-aligned.html` (earlier exploration; superseded by the Linear-style layout but useful for the stats unification rationale).
- Row alignment reference: `collection-row-aligned.html` (earlier exploration; superseded).
- Decks page reference: existing production at https://fetchlist.kagaiodin.dev for visual rhythm parity (meta line, chip vocabulary, action row hierarchy).
