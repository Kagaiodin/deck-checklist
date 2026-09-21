# Zero States Unification — Technical Design Spec

**Feature:** One shared EmptyState pattern across Decks / Collection / Orders + deck dead-end fix + bare-`.btn` hardening
**Status:** Ready for implementation
**Design source:** Open Design project `5c6d105f-c086-441b-ad55-2e3403c89799`
  — `zero-states-mockup.html` (primary — all four states, desktop + mobile frames, anatomy spec, button fix)
  — `design-review-2026-07-13.html` (context — findings P0-1, P1-1, P1-2)

---

## Problem Statement

Three distinct problems, one shared fix:

1. **The deck dead-end (P0).** With decks present but none selected, the canvas renders a bare
   `<p>Select a deck from the sidebar.</p>` (`App.tsx:1338`). On mobile/tablet (<1024px) the
   sidebar doesn't exist — the instruction points at a control that isn't there. Even on
   desktop it's the only screen with no icon, no action, no card.
2. **Three empty-state patterns (P1-1).** Orders has a bordered card + icon tile + two buttons
   (the strongest). Collection floats a 56px logo + text. Decks first-run has its own
   `deck-empty-cta` variant. Same job, three shapes.
3. **Near-white buttons (P1-2).** `.btn` (`App.css:187`) declares **no background**, so any
   `<button className="btn">` without a variant class falls through to the UA's default
   light-gray chrome. Three shipped offenders: Orders empty "Open buy list →"
   (`OrdersPage.tsx:821`), mobile sheet "Cancel order" (`:270`) and "Delete order" (`:273`).

---

## 1. Shared `EmptyState` component

New component (suggested: `src/components/EmptyState.tsx`) + CSS in `App.css`. All four
full-page zero states render through it.

```tsx
type EmptyStateProps = {
  icon: React.ReactNode;          // monoline SVG, 1.6 stroke, currentColor
  title: string;
  body: React.ReactNode;          // ≤2 lines; may contain responsive spans (§2)
  primary?: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
};

export function EmptyState({ icon, title, body, primary, secondary }: EmptyStateProps) {
  return (
    <div className="empty-card">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <h2 className="empty-title">{title}</h2>
      <p className="empty-body">{body}</p>
      {(primary || secondary) && (
        <div className="empty-actions">
          {primary && <button className="btn btn-primary" onClick={primary.onClick}>{primary.label}</button>}
          {secondary && <button className="btn btn-secondary" onClick={secondary.onClick}>{secondary.label}</button>}
        </div>
      )}
    </div>
  );
}
```

```css
/* App.css — shared zero-state anatomy (values from zero-states-mockup.html) */
.empty-card {
  background: var(--surface);
  border: 1px solid var(--border-dim);
  border-radius: 12px;
  padding: 32px 28px;
  max-width: 400px;
  margin: 0 auto;
  display: flex; flex-direction: column; align-items: center;
  text-align: center; gap: 6px;
}
.empty-icon {
  width: 48px; height: 48px; border-radius: 10px;
  background: var(--accent-dim); color: var(--accent-light);
  display: grid; place-items: center; margin-bottom: 10px;
}
.empty-icon svg { width: 26px; height: 26px; }
.empty-title { font-size: 17px; font-weight: 600; margin: 0; }
.empty-body { font-size: 13.5px; color: var(--text-muted); max-width: 38ch; margin: 0; }
.empty-actions { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; justify-content: center; }
@media (max-width: 479px) {
  .empty-actions { flex-direction: column; width: 100%; }
  .empty-actions .btn { width: 100%; justify-content: center; }
}
```

Anatomy rules (enforced by this component, documented in the mockup):
- Icon is a monoline SVG in a 48px `--accent-dim` tile — never an emoji, never the raw 56px logo.
- Title 17px/600: verb-first when the user must act ("Pick a deck"), state-first when the page
  is simply empty ("No orders yet").
- Body ≤2 lines, ≤38ch, must never reference chrome that isn't on the current surface.
- ≤2 actions: at most one `btn-primary` + one `btn-secondary`. Never a bare `.btn`.
- Accent budget: the icon tile and the primary button are the only accent uses.

---

## 2. Deck none-selected state (the P0)

Replace `App.tsx:1336-1340`:

```tsx
// remove:
<div className="empty-state centered">
  <p>Select a deck from the sidebar.</p>
</div>

// with:
<div className="empty-state centered">
  <EmptyState
    icon={/* deck-with-check monoline SVG from zero-states-mockup.html */}
    title="Pick a deck"
    body={<>
      <span className="empty-copy-desktop">Choose a deck from the list on the left to see its fetch list.</span>
      <span className="empty-copy-mobile">Choose a deck above to see its fetch list.</span>
    </>}
    primary={undefined /* desktop: sidebar is the action */}
    secondary={{ label: "+ Import another deck", onClick: () => setShowImport(true) }}
  />
  <div className="empty-mobile-primary">
    <button className="btn btn-primary" onClick={() => setDeckPickerOpen(true)}>Choose a deck</button>
  </div>
</div>
```

Responsive copy swap is pure CSS keyed to the **same breakpoint that hides the sidebar**
(`App.css:349`, `max-width: 1023px`):

```css
.empty-copy-mobile  { display: none; }
.empty-mobile-primary { display: none; }
@media (max-width: 1023px) {
  .empty-copy-desktop { display: none; }
  .empty-copy-mobile  { display: inline; }
  .empty-mobile-primary { display: block; }
}
```

Implementation freedom: if threading the mobile primary through `EmptyState.primary` with a
CSS visibility class is cleaner than the sibling div above, do that — the contract is:
**desktop shows no primary** (the sidebar is the action; secondary = import), **mobile/tablet
shows primary "Choose a deck"** wired to `setDeckPickerOpen(true)` + the import secondary.

The string `"Select a deck from the sidebar."` must not survive anywhere in the codebase.

---

## 3. Decks first-run migration

`App.tsx:1306-1334` (`deck-empty-cta` block) renders through `EmptyState`, keeping current copy
and handlers:

- title `No decks yet`, body `Import a decklist from Moxfield, MTGO, or Arena to start tracking your missing cards.`
- primary `↓ Import a deck` → `setShowImport(true)` (keep the existing download-arrow SVG inside the label if trivial)
- secondary `Create blank deck` → the existing ADD_DECK handler (was the text link "or create a blank deck"; it becomes a proper `btn-secondary`)
- Keep the existing deck SVG as the tile icon.
- Delete `deck-empty-cta*` / `deck-empty-icon` / `deck-empty-headline` / `deck-empty-body` /
  `deck-empty-actions` / `deck-empty-btn-*` CSS (`App.css:1443+`) once nothing references them.

## 4. Collection migration

`CollectionPage.tsx:440-455`: replace the floating block with `EmptyState`:

- icon: two-overlapping-cards monoline SVG (in `zero-states-mockup.html`) — replaces the 56px `AppIcon`
- title `No cards yet`, body unchanged
- primary `Upload CSV` → `csvInputRef.current?.click()`
- secondary `+ Add card` → `setQuickAddOpen(true)` (upgrades from `btn-ghost` to `btn-secondary`)
- Delete `.collection-empty*` CSS (`CollectionPage.css:183-197`, and the 671-675 mobile rules)
  once migrated.

## 5. Orders

Already matches the anatomy — **do not restructure**. Two changes only:

- `OrdersPage.tsx:821`: `className="btn"` → `className="btn btn-secondary"` on "Open buy list →".
- Optional cleanup: render through `EmptyState` for one source of truth; if done, keep the
  existing copy, icon, and handlers exactly, and delete `orders-empty-card` CSS. Low priority —
  visual output must not change either way.

## 6. Bare-`.btn` hardening + mobile sheet variants

`App.css:187` — add safe defaults so a forgotten variant degrades to ghost, never UA chrome:

```css
.btn {
  /* existing rules … */
  background: transparent;
  color: var(--text-muted);
  border: 1px solid transparent;   /* replaces border: none — keeps variant heights equal */
}
```

Check for regressions: any existing bare-`.btn` usage that *relied* on UA chrome (there should
be none by design) and any `.btn` with `border: none` assumptions in tight layouts — the 1px
transparent border adds 2px to height unless `box-sizing: border-box` covers it (it does,
globally).

New variant in `App.css`, reusing the `.pop-btn-danger` recipe (`App.css:879`):

```css
.btn-danger-soft {
  background: rgba(224, 83, 83, .2);
  color: var(--danger);
  border: 1px solid rgba(224, 83, 83, .3);
}
```

Mobile order sheet (`OrdersPage.tsx`):
- `:270` "Cancel order": `className="btn"` → `className="btn btn-secondary"`
- `:273` "Delete order": `className="btn"` → `className="btn btn-danger-soft"`

## 7. Copy matrix (single source of truth)

| Surface | Title | Body | Primary | Secondary |
|---|---|---|---|---|
| Decks · first run | No decks yet | Import a decklist from Moxfield, MTGO, or Arena to start tracking your missing cards. | ↓ Import a deck | Create blank deck |
| Decks · none selected · ≥1024 | Pick a deck | Choose a deck from the list on the left to see its fetch list. | — | + Import another deck |
| Decks · none selected · <1024 | Pick a deck | Choose a deck above to see its fetch list. | Choose a deck | + Import another deck |
| Collection · empty | No cards yet | Import your collection from Moxfield or add cards manually. | Upload CSV | + Add card |
| Orders · empty | No orders yet | Orders track cards you've bought from vendors so they appear in your collection when they arrive. | + New order | Open buy list → |

## 8. Out of scope

- Filtered-to-zero results (search with no matches) — the mockup shows a lighter dashed inline
  variant; ship it later as a follow-up, not part of this pass.
- The `NewOrderSheet` inline "No cards yet — search above…" hint — different component, fine as is.
- Header shapes, vendor picker, mobile deck-header merge — separate findings.

## 9. Acceptance criteria

- [ ] `grep -r "Select a deck from the sidebar"` returns nothing.
- [ ] At 390 / 768 / 1023 px: none-selected state shows "above" copy + "Choose a deck" primary that opens the picker sheet.
- [ ] At ≥1024 px: "list on the left" copy, no primary, import secondary works.
- [ ] All four full-page zero states render the same card anatomy (icon tile / 17px title / muted body / action row).
- [ ] No `<button className="btn">` without a variant class remains (`grep -n 'className="btn"' src/`).
- [ ] Bare `.btn` (if ever reintroduced) renders transparent/ghost, not UA gray — verify by temporarily removing a variant class in dev tools.
- [ ] "Open buy list →", "Cancel order" use the secondary recipe; "Delete order" uses `btn-danger-soft`; all three verified in dark **and** light mode.
- [ ] Dead CSS removed: `deck-empty-*`, `.collection-empty*` (and `orders-empty-*` only if Orders migrates to the component).
- [ ] Tests: update any assertion touching the removed sidebar string; `OrdersPage.test.tsx:33` ("No orders yet") should still pass; add a smoke test that the none-selected state renders the picker-opening button under a narrow viewport if the harness supports it.
- [ ] Re-capture `01`, `09`, `15`, `21`, `27`, `49`, `52`, `53` (`npm run screenshots`).

## 10. Suggested commit split

1. `EmptyState` component + shared CSS + `.btn` hardening + `btn-danger-soft` (no visual change to shipped states yet).
2. Deck none-selected replacement (the P0) + first-run migration + string deletion.
3. Collection migration + Orders button variants + dead CSS removal + test updates.
4. Screenshot re-capture.
