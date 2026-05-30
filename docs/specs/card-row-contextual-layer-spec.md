# Card Row Contextual Layer — Technical Design Spec

**Feature:** Mobile bottom sheet + desktop popover for card row secondary actions  
**Status:** Ready for implementation  
**Design source:** Open Design project `a0b6c12b-7f1f-4082-aebb-898fa0599033`  
  — `card-row-sheet-mobile-2.html` (mobile sheet)  
  — `card-row-mockup.html` (desktop rest/hover states)

---

## Problem Statement

The card row's current desktop hover state renders an "All printings ↗" link inline on line 2 using `visibility: hidden` (or equivalent) at rest. This creates ghost space that pushes the alt-name chip sideways when the link is hidden. The fix requires removing secondary actions from the row's static layout entirely and surfacing them through a contextual layer instead.

---

## 1. Trigger Model

### Mobile

- **Trigger:** Tap anywhere on the card row **except** the checkbox.
- **No hover state exists** — the row has no affordance at rest other than the row itself being tappable.
- The tapped row receives a visual pressed state (`background: var(--surface-2)` = `#1e2238`) while the sheet animates in.
- Releasing the tap (touchend) triggers the sheet open.

### Desktop

- **Primary trigger:** A `⋯` overflow button that appears on row hover, positioned at the far right of line 1 (after the status tag, flex-shrink: 0). It appears via `display: flex` on hover; at rest it is `display: none`.
- **Secondary trigger:** Right-click anywhere on the row body (outside the checkbox) opens the same popover anchored near the cursor.
- The row receives a `border-color: var(--accent)` (`#6c5ce7`) highlight on hover, matching the existing hover spec from the mockup.

### Non-triggers (both platforms)

- Tapping/clicking the **checkbox** must not open the sheet or popover. The checkbox is a direct interactive target for the acquire-toggle action. Event propagation from the checkbox must be stopped (`stopPropagation`) before it reaches the row's click handler.

---

## 2. Mobile Bottom Sheet

### Anatomy (from `card-row-sheet-mobile-2.html`)

```
┌─────────────────────────────────┐
│        ▬  (drag handle)         │
├─────────────────────────────────┤
│  Card Name          15px/600    │
│  [SET·RARITY chip] Italic name  │  ← sheet-card-meta
├─────────────────────────────────┤
│  STATUS                         │  ← section label
│  [Owned] [Need to buy] [Ordered] [Proxy]   │
├─────────────────────────────────┤
│  [↗] View all printings  ›      │
│  [⊞] Swap printing       ›      │
│  [★] Add to buy list            │
├─────────────────────────────────┤
│  [✕] Remove from deck           │  ← danger
└─────────────────────────────────┘
```

### Height

- Natural height — the sheet is not fixed-height. It sizes to its content and renders from the bottom up.
- On short viewports (< 600px) the sheet may approach 60–70% of screen height; it should not exceed 90vh. If content overflows, the sheet body scrolls internally (the header and handle remain fixed).

### Handle

- Width: `36px`, height: `4px`, `border-radius: 2px`
- Color: `var(--border)` = `#2d3258`
- Margin: `10px auto 6px` (centered, above the header)

### Scrim

- `background: rgba(5, 6, 14, 0.6)` with `backdrop-filter: blur(2px)`
- Covers the full screen behind the sheet
- `z-index`: sheet stack sits above the deck list and app navigation

### Animation

- **Open:** Sheet translates from `translateY(100%)` to `translateY(0)`. Duration: `280ms`, easing: `cubic-bezier(0.32, 0.72, 0, 1)` (decelerate-in).
- **Close:** Sheet translates from `translateY(0)` to `translateY(100%)`. Duration: `220ms`, easing: `cubic-bezier(0.4, 0, 1, 1)` (standard ease-in).
- Scrim fades in/out with `opacity` over the same duration.
- Swipe-to-dismiss: track `touchmove` on the handle or sheet body. If the user drags downward and releases with velocity > threshold (or displacement > 30% of sheet height), close. If released below threshold, spring back to `translateY(0)`.

### Dismiss

Three paths close the sheet:
1. **Swipe down** on the handle or sheet body (see animation above).
2. **Tap the scrim/backdrop** outside the sheet.
3. **Escape key** (keyboard or system back gesture on Android).

### Body Scroll Lock

- When the sheet opens, prevent the underlying list from scrolling: apply `overflow: hidden` to `document.body` (or use a scroll-lock utility already in the project).
- Restore scroll position and `overflow` on close.

### Focus Trap

- On open, move focus into the sheet. The first focusable element should be the first status option pill.
- Tab key must cycle only within the sheet while it is open (`role="dialog"` with `aria-modal="true"` enables this for assistive technologies; a JS focus trap is required for full keyboard support regardless).
- On close, return focus to the card row element that triggered the sheet.

---

## 3. Desktop Popover

### Positioning

- The popover anchors to the `⋯` button that triggered it (or near the cursor for right-click).
- Default position: **below and left-aligned** to the `⋯` button, with an 8px vertical gap.
- **Flip logic:** If the popover would overflow the viewport bottom, flip to render above the anchor. If it would overflow the right edge, align to the button's right edge instead (right-anchored).
- Width: fixed at `220px`. Height is content-driven.

### Visual

- Background: `var(--surface-2)` = `#1e2238`
- Border: `1px solid var(--border)` = `#2d3258`
- Border radius: `8px`
- Box shadow: `0 8px 24px rgba(0, 0, 0, 0.5)`
- Menu items use the same action anatomy as the sheet: icon + label + optional description

### Dismiss

Two paths close the popover:
1. **Click outside** the popover (document-level mousedown listener; remove on close).
2. **Escape key.**

Selecting an action also closes the popover (except for destructive actions that show a confirmation step inline or in a follow-up dialog).

### Z-index / Stacking Context

- The popover must render above all list content, the sidebar rail, and fixed headers.
- Render via a React portal into `document.body` (or a dedicated portal root) to escape any `overflow: hidden` or stacking context ancestors in the list layout.
- Assign a z-index of `500` (or the project's established overlay tier — check for existing z-index constants before introducing a new value).

---

## 4. Shared Action List

Both the mobile sheet and desktop popover expose the same set of actions, in this order:

### Status (section)

Displayed as a horizontal scrollable row of pill options on mobile. On desktop, rendered as a segmented group or stacked radio-style menu items.

| Option | Token color | Active indicator |
|--------|-------------|-----------------|
| Owned | `#4ade80` (`--success`) | `border: 1.5px solid currentColor` |
| Need to buy | `#e05353` (`--danger`) | same |
| Ordered | `#60a5fa` (`--info`) | same |
| Proxy | `#c084fc` (`--proxy`) | same |

The current status option is pre-selected when the layer opens. Selecting a different option commits the change immediately (optimistic update) and the pill updates in the background row. The sheet/popover stays open after a status change so the user can take additional actions.

### View All Printings

- Icon: `↗` on a blue-tinted `rgba(96,165,250,.15)` background
- Description: "Browse other editions of this card"
- Behavior: navigates externally (or to a printings screen). Closes the sheet/popover before navigating.
- On mobile this is a separate action from the set chip — the chip on the row is NOT a tap target for this nav on mobile (the chip opens the sheet; this action inside the sheet handles printings nav).

### Swap Printing

- Icon: `⊞` on a purple-tinted `rgba(192,132,252,.15)` background
- Description: current set code + " → choose another edition" (e.g. "SLD → choose another edition")
- Behavior: navigates to the printing picker. Closes the sheet/popover before navigating.

### Add to Buy List

- Icon: `★` on a yellow-tinted `rgba(251,191,36,.15)` background
- Description: "Queue for next order"
- Behavior: immediate action, no navigation. Show a brief confirmation (toast or transient label update) and close the sheet/popover.

### Remove from Deck (destructive)

- Icon: `✕` on a red-tinted `rgba(224,83,83,.15)` background
- Label color: `var(--danger)` = `#e05353`
- Behavior: requires confirmation. Do not execute immediately on tap.
  - **Mobile:** Replace the sheet content with a confirmation view (title, "This will remove [Card Name] from your deck.", Cancel / Remove buttons). Do not dismiss the sheet first.
  - **Desktop:** Replace the popover content with a compact confirm step (same pattern). Alternatively, show a modal dialog if the popover confirm view feels too cramped.
- On confirm, execute the remove and close the sheet/popover.

---

## 5. Checkbox Carve-Out

The checkbox (`role="checkbox"`) on line 1 of every card row is a direct inline control for toggling the acquire state. It must not open the sheet or popover.

**Implementation rule:** The card row's click/tap handler must check if the event target is the checkbox (or its label, if one is present) and return early without opening the contextual layer. Use `event.target.closest('input[type="checkbox"]')` as the guard.

Do not use `stopPropagation` on the checkbox itself as this may interfere with React's synthetic event system — guard at the row handler level instead.

---

## 6. Card Row Line 2 Fix

The root cause of the ghost-space bug is using `visibility: hidden` (or `opacity: 0` while retaining `display`) on the "All printings ↗" link. This keeps the element in flow and reserves its width even when invisible, shifting adjacent content.

### Fixed Layout (from `card-row-mockup.html`)

Line 2 is a single flex row with two children:

```
.row-line2
  .row-line2-left          ← flex: 1, min-width: 0
    .set-chip              ← flex-shrink: 0
    .alt-name              ← truncates if needed, optional
  .printings-link          ← flex-shrink: 0, display: none at rest
```

**Key rules:**

- `.printings-link` uses `display: none` at rest — it contributes **zero** layout width. On desktop hover, it switches to `display: flex`. This completely eliminates ghost space.
- `.row-line2-left` has `flex: 1` and `min-width: 0` so it fills available space and allows `.alt-name` to truncate via `text-overflow: ellipsis` without expanding past the container.
- When the `⋯` button replaces the inline "All printings ↗" link as the hover affordance (see Trigger Model), it follows the same pattern: `display: none` at rest, `display: flex` on hover, positioned at the right end of line 1.

### At-rest line 2 content

At rest, line 2 contains exactly:

- `[SET·RARITY chip]` — always present
- `[alt name]` — present only if the card has an alternate name; no placeholder, no hidden element

No other elements appear on line 2 at rest. Any element that is conditionally visible must use `display: none` when hidden — never `visibility: hidden`, `opacity: 0`, or `width: 0` with content still in flow.

---

## 7. State to Pass into the Layer

When the sheet or popover opens, it receives a context object. This should be passed as props or through a React context/state manager:

```
CardRowContextPayload {
  cardId: string              // stable card identifier
  deckId: string              // which deck this row belongs to
  cardName: string            // display name (line 1)
  altName?: string            // alternate/art name (line 2), if present
  currentStatus: 'owned' | 'need' | 'ordered' | 'proxy'
  printing: {
    setCode: string           // e.g. "SLD"
    setName: string           // e.g. "Secret Lair Drop"
    rarity: 'common' | 'uncommon' | 'rare' | 'mythic' | 'special'
    collectorNumber?: string
  }
  quantity: number            // e.g. 4
}
```

The layer is read-only with respect to this data — mutations (status change, remove) go through the existing action/mutation layer (API calls, optimistic state) and the row re-renders based on updated state after the operation.

---

## 8. Keyboard and Accessibility

### ARIA Roles

| Surface | `role` | Notes |
|---------|--------|-------|
| Mobile sheet | `role="dialog"` | Full screen-reader dialog semantics; `aria-modal="true"` |
| Desktop popover | `role="menu"` | If actions are all commands; use `role="dialog"` if status selection makes it feel more form-like |
| Sheet/popover title | `aria-labelledby` | Points to the card name heading inside the layer |
| Status options | `role="radio"` within `role="radiogroup"` | Reflects mutually exclusive selection |
| Action items | `role="menuitem"` | For non-status actions inside a `role="menu"` |

### Focus Management

**Opening:**
- Shift focus into the layer immediately after the open animation begins (not after it completes, to avoid focus lag).
- First focused element: the first status option in the Status section.

**Within the layer:**
- Tab moves through all focusable elements in DOM order.
- For `role="menu"`: arrow keys move between menu items; Tab dismisses and returns focus to the trigger.
- For status `role="radiogroup"`: left/right arrow keys move between options; Space selects.

**Closing:**
- Return focus to the element that triggered the layer:
  - Mobile: the card row element (give it `tabindex="-1"` if it is not natively focusable, so it can receive programmatic focus).
  - Desktop: the `⋯` button.

### Screen Reader Announcements

- When a status changes, announce the new value: e.g. `"Status changed to Ordered"` via a live region (`aria-live="polite"`).
- When the sheet opens, screen readers will announce the dialog title (card name) automatically via the `role="dialog"` + `aria-labelledby` pairing.

### Trigger Button

The `⋯` desktop button must have `aria-label="Card actions for [card name]"` (not just `⋯`) so screen readers convey its purpose.

---

## 9. Implementation Notes

### Component Boundaries

```
CardRow
  ├── Checkbox (direct, non-delegating)
  ├── RowBody (click/tap → open layer)
  │     ├── Line1: qty, name, status tag
  │     └── Line2: set chip, alt name, [⋯ button on hover — desktop only]
  └── (portal) CardRowSheet   ← mobile
      (portal) CardRowPopover ← desktop
```

`CardRowSheet` and `CardRowPopover` are sibling portal components, not children of `CardRow` in the DOM. They receive `CardRowContextPayload` as props.

### Portal

Both surfaces must render in a portal (`ReactDOM.createPortal`) attached to `document.body` or a dedicated `#overlay-root` element. This ensures they escape any `overflow: hidden` on the list container and correctly stack above all other UI.

### Detecting Mobile vs. Desktop

Use a media query hook (e.g. `useMediaQuery('(pointer: coarse)')` or a breakpoint hook already in the project) to decide which surface to open — do not rely on screen width alone, as some large-screen touch devices should use the sheet.

### Existing Patterns

Before implementing from scratch, check the codebase for:
- Any existing sheet/drawer component used in the buy-flow or import modal — reuse its animation and scroll-lock logic.
- Any existing popover or dropdown component — reuse its positioning and dismiss logic.
- The `z-index` scale used by existing overlays — do not introduce a new arbitrary value.

### Optimistic Status Update

Status changes should update local state immediately on selection, then fire the mutation. If the mutation fails, revert and surface an error. Do not close the sheet/popover on status change — the user may want to make additional changes (e.g. view printings after updating status).

### Destructive Confirm Step

The "Remove from deck" confirmation must not navigate away from the current view. On mobile, replace the sheet's inner content (not the whole sheet) with the confirmation UI; preserve the sheet backdrop and dismiss behavior. On desktop, replace the popover body in-place.

---

## Token Reference

All values sourced directly from the Open Design mockups. Do not hardcode — use the CSS custom property names.

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#0d0f1a` | App background |
| `--surface` | `#151829` | Card row background |
| `--surface-2` | `#1e2238` | Sheet/popover background, tapped row |
| `--surface-3` | `#252a42` | Elevated surface within sheet |
| `--border` | `#2d3258` | All borders, sheet handle |
| `--accent` | `#6c5ce7` | Row hover border, ⋯ button active |
| `--text` | `#eceef8` | Primary text |
| `--text-muted` | `#9ba5c9` | Secondary text, chips, metadata |
| `--success` | `#4ade80` | Owned status |
| `--danger` | `#e05353` | Need/Remove actions — canonical `--fl-danger` value |
| `--info` | `#60a5fa` | Ordered status, printings icon |
| `--warn` | `#fbbf24` | Buy list icon |
| `--proxy` | `#c084fc` | Proxy status, swap printing icon |
