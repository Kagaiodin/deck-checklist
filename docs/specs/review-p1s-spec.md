# Review P1s — Vendor Row Unification · Mobile Deck Header Merge · Collection Count Language

**Feature:** The three remaining P1 groups from the 2026-07-13 design review (P1-7, P1-5/6, P1-3/4)
**Status:** Ready for implementation
**Design source:** Open Design project `5c6d105f-c086-441b-ad55-2e3403c89799`
  — `review-p1s-mockup.html` (primary — before/after for all three groups)
  — `design-review-2026-07-13.html` (context — finding text)
**Constitution:** `DESIGN.md` v2 (same project) — red budget §3, voice §6, converge/diverge §7.
Line numbers verified against the repo on 2026-07-18.

---

## Part A — P1-7: One vendor row, both flows

### Problem

The buy flow (`VendorPicker.tsx`) asks "Choose vendor" with **radio-left** rows
(`.buy-picker-option`: radio → name + send-method caption → trailing last-used date).
The New-order sheet (`NewOrderSheet.tsx:243-258`) asks the same question with **radio-right**
rows (`.nos-vrow`: name + "N past" tag → "Last {date}" meta → trailing `.nos-radio`).
Same mental act, mirrored controls.

### Fix — shared `VendorRow` component

New `src/components/VendorRow.tsx` + CSS in `App.css` (it's cross-feature now):

```tsx
type VendorRowProps = {
  name: string;
  historyTag?: string;      // "2 past" — omit when 0
  caption: string;          // buy flow: send-method (+ " · Last Jun 5"); order flow: "Last Jun 5" | "No past orders"
  selected: boolean;
  onSelect: () => void;
};
```

Anatomy (one layout, no variants):
- Line 1: `name` (14px/550) + optional `historyTag` pill (mono 10.5px, `--accent-dim` bg, `--accent-light` text)
- Line 2: `caption` (12px, `--text-muted`)
- Trailing: 18px radio, `--border` ring → `--accent` ring + dot when selected
- Row: `--surface-2`, 1px `--border-dim`, `--radius`; selected = `--accent` border + `--accent-dim` bg
- Element is a `<button>` (both flows already do this — keep keyboard/focus behavior)

### Call-site changes

1. **`VendorPicker.tsx:52-67`** — replace the `.buy-picker-option` map body with `VendorRow`:
   - `caption`: `v.sendMethodDesc`, appending `` ` · Last ${formatLastUsed(...)}` `` when a last-used exists
     (the trailing `.buy-picker-option-last` slot goes away).
   - `historyTag`: derive from order history if cheaply available (`NewOrderSheet` already
     computes per-vendor counts from orders); if wiring order data into the buy flow is not
     trivial, omit the tag — the layout must not reserve space for it.
2. **`NewOrderSheet.tsx:243-258`** — replace the `.nos-vrow` map body with `VendorRow`:
   - `historyTag`: `` `${v.count} past` `` when `count > 0`; `caption`: existing
     `Last {fmtDate}` / `"No past orders"` strings unchanged.
   - The custom-vendor input row below the list is untouched.
3. **CSS cleanup** once both flows migrate: delete `.buy-picker-option*` rules
   (`buy-flow.css`) and `.nos-vrow` / `.nos-vmain` / `.nos-vname` / `.nos-vtag` /
   `.nos-vmeta` / `.nos-radio` rules (`NewOrderSheet.css`). Grep before deleting —
   `.nos-radio` may be reused elsewhere in the sheet.

Out of scope: adding prices to buy-list rows (P2-3), Escape/two-gesture dismissal (#70).

---

## Part B — P1-5 + P1-6: Mobile deck header merge · delete behind Edit

### B1. Switcher becomes the title (P1-5)

Current mobile stack repeats the deck name: `.mobile-deck-bar` (`App.tsx:1104-1116` —
name 15px + "N decks · tap to switch" sub) followed by the `deck-content-header` H2
(`App.tsx:1137`, `.deck-content-title`) with the same name plus Rename.

Changes (mobile only — `App.css:344` is the existing `≥` breakpoint where
`.mobile-deck-bar` hides; desktop header is untouched):

1. **`App.tsx:1104-1116`** — promote the switcher to title weight:
   - `.mobile-deck-name` → 19px/600 display face, `-0.01em` (add a modifier class or
     retune the base — it only renders on mobile).
   - Sub-line: `"{N} decks ▾"` — drop "· tap to switch" (the chevron + button semantics
     already say it; keep `aria-label="Switch deck"` on the button).
2. **Hide the duplicate title on mobile:** `.deck-title-wrap { display: none }` inside the
   `max-width: 1023px` block (same breakpoint that shows `.mobile-deck-bar`). The
   `.deck-header-actions` row stays visible and moves up to sit directly under the switcher.
3. **Rename on mobile:** with `.deck-title-wrap` hidden, the Rename affordance disappears.
   Add a "Rename deck" item to the existing actions dropdown (`actions-dropdown`,
   `App.tsx:~1150`) — visible at all widths (harmless on desktop, required on mobile).
   It triggers the existing `startRename(activeDeck)` flow; the rename form already
   renders outside `.deck-title-wrap` and keeps working.

### B2. Picker ✕ behind Edit mode (P1-6)

Current: every `.deck-picker-sheet` row carries a live `×` (`.deck-delete-btn`,
`App.tsx:779-783`) calling `handleDeleteDeck` — always visible, in the thumb zone,
adjacent to the switch target.

Changes:

1. Add `const [pickerEditMode, setPickerEditMode] = useState(false)` (reset to `false`
   whenever the sheet opens/closes).
2. **Sheet header (`App.tsx:726-730`):** insert an Edit toggle between title and close:
   `Edit` ↔ `Done` (`--accent-light` text button, 550 weight when active). Order:
   title (flex) · Edit · ✕.
3. **Rows:** render the delete affordance only when `pickerEditMode`. It becomes a
   **labelled** button — `Delete` (11.5px/500, `--danger` text on `--danger` 15% tint,
   `--radius-sm`) — not a bare ✕. Wire to the existing `handleDeleteDeck(deck.id)`
   confirm flow unchanged. In edit mode, row tap still switches decks (delete is the
   only destructive control; no need to disable switching).
4. `.deck-delete-btn` CSS (`App.css`) is replaced by the new labelled recipe; reuse the
   danger-soft tint values already specced in zero-states-spec §6 (`.btn-danger-soft`)
   if that landed — one recipe, not two.

Red budget check (constitution §3): in edit mode every row shows a red Delete — that is
N same-meaning signals in one list, which is the acceptable "edit mode" exception (the
whole surface is declared destructive by the toggle); rest state returns to zero red.

---

## Part C — P1-3 + P1-4: Collection count language · mobile free label

### C1. Unit-free search, unit-consistent badge (P1-3)

Current: title badge `126` (total copies, `CollectionHeader.tsx:94`
`.collection-topbar-count` ← `totalCards`), search `"Search 33 cards…"` (unique,
`CollectionHeader.tsx:102` and `:228`, `CollectionControls.tsx:60`), pill `All 33`
(unique). Three numbers, two units, no labels.

Changes:

1. All three placeholders → `"Search cards…"` (drop the count interpolation entirely).
2. `.collection-topbar-count` value: `totalCards` → `uniqueCards` — the badge now matches
   the row unit and the All pill. Check the mobile inline count
   (`CollectionHeader.tsx:193`, `.collection-mobile-inline-count`) renders the same
   `uniqueCards` value; align it if not.
3. The stats line (`CollectionHeader.tsx:~210`) is **unchanged** — it stays the single
   place both units meet: "126 cards · 33 unique · 34 in decks".

### C2. Mobile free count gets its label back (P1-4)

Current (`CollectionPage.css:666-668`): mobile hides the labelled `.collection-card-free`
chip and instead tints the **total** qty amber via `.collection-card-qty-big[data-free]` —
color alone carries the meaning (WCAG 1.4.1), and the amber number is a different number
than amber means on desktop.

Changes:

1. Delete both mobile overrides at `CollectionPage.css:666-668` (the
   `.collection-card-free { display: none }` and the `[data-free]` amber tint).
2. Render the free count as a **sub-meta segment** on mobile: the row's sub-meta line
   (`CollectionRow.tsx:56` builds the parts array — "1 printing · 1 deck") gains a final
   `` `${free} free` `` segment in `--warn` at 550 weight when `free > 0`. Reuse the
   existing `.collection-card-free` tokens; no new pattern.
3. Desktop rendering ("3× · 2 free" with white qty) is already correct — unchanged.
   Remove the now-unused `data-free` attribute if nothing else reads it.

---

## Acceptance criteria

**A (vendor rows)**
- [ ] Both flows render the same row anatomy: name (+ history tag) / caption / trailing radio.
- [ ] Buy flow keeps send-method captions; order sheet keeps history strings; custom-vendor input untouched.
- [ ] Radio is trailing in both; no radio-left layout remains (`grep buy-picker-radio`).
- [ ] Keyboard: rows are buttons, focus-visible ring intact in both flows, dark + light.

**B (mobile deck header)**
- [ ] At 390px: deck name appears exactly once, at title weight, inside the tappable switcher; "tap to switch" copy gone.
- [ ] Actions row sits directly under the switcher; progress card is fully above the fold on a 390×844 viewport with a 3-deck profile.
- [ ] Rename reachable from the actions dropdown at all widths; desktop header unchanged at ≥1024px.
- [ ] Picker rest state has zero destructive controls; Edit → labelled Delete per row → existing confirm flow; Done/reopen resets to rest.
- [ ] `grep -n "deck-delete-btn" src/` returns only the new edit-mode recipe (or nothing if renamed).

**C (Collection counts)**
- [ ] `grep -rn "Search .*cards…" src/` → three sites all read `"Search cards…"`.
- [ ] Badge, All-pill, and mobile inline count all show unique (33); stats line still shows both units.
- [ ] Mobile row: qty white, sub-meta ends with amber "N free" when free > 0; no `[data-free]` qty tint.
- [ ] Free count means the same number on desktop and mobile; verified in dark + light.

**Tests / capture**
- [ ] Update assertions touching "tap to switch", vendor row classnames, and search placeholders.
- [ ] Re-capture affected states (`npm run screenshots`): buy-flow vendor, order-sheet step 1, mobile deck selected, mobile deck picker, desktop + mobile Collection.

## Suggested commit split

1. `VendorRow` component + buy-flow adoption + order-sheet adoption + CSS cleanup.
2. Mobile header merge (B1) — markup + breakpoint CSS + Rename menu item.
3. Picker edit mode (B2).
4. Collection count language + mobile free label (C1 + C2) + test updates.
5. Screenshot re-capture.
