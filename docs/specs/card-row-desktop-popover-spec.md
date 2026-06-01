# Card Row Desktop Popover — Technical Design Spec

**Feature:** Desktop contextual action popover for card rows  
**Status:** Ready for implementation  
**Design source:** Open Design project `a0b6c12b-7f1f-4082-aebb-898fa0599033`  
  — `card-row-desktop-popover-2.html` (primary — popover anatomy, all states)  
  — `card-row-mockup.html` (row layout, line 2 ghost-space fix)  
**Related spec:** `docs/specs/card-row-contextual-layer-spec.md` (mobile sheet + shared concepts)

---

## Problem Statement

The card row's hover state currently renders an "All printings ↗" link inline on line 2. When hidden at rest via `visibility: hidden` or a zero-opacity approach, the link still participates in layout and creates ghost space that pushes the alt-name sideways. The fix removes all secondary actions from the static row layout and places them in a positioned popover opened by a `⋯` overflow button that appears on hover in line 1.

---

## 1. Trigger Model

### Primary trigger: ⋯ overflow button

- The `⋯` button is rendered in `row-line1` as the last flex child, after the status pill (`flex-shrink: 0`).
- **At rest:** `display: none` — contributes zero layout space, no ghost width.
- **On row hover:** `display: flex` — button becomes visible and clickable.
- **Clicking the ⋯ button** opens the popover anchored to that button. Clicking it again while the popover is open closes the popover (toggle behavior).
- The button remains visible (`display: flex`) and enters its active visual state while the popover is open, even if the cursor leaves the row.

### Secondary trigger: right-click

- Right-clicking anywhere on the row body (outside the checkbox) opens the popover.
- The popover anchors to the `⋯` button position regardless of where the right-click occurred.
- This is a progressive-enhancement affordance — not shown in the mockup, no special anchor logic required beyond reusing the ⋯ button ref.

### Checkbox carve-out

- The checkbox (`input[type="checkbox"]`) is a direct inline control and must **never** open the popover.
- Guard at the row's `onClick` handler level: check `event.target.closest('input[type="checkbox"]')` and return early if truthy.
- Do not use `stopPropagation` on the checkbox element itself — it may interfere with React's synthetic event bubbling. The row handler is the correct guard point.
- The checkbox retains its own click behavior (acquire-state toggle) unmodified.

---

## 2. Overflow Button Anatomy

All values sourced from `.row-overflow` in `card-row-desktop-popover-2.html`.

### Dimensions and shape

| Property | Value |
|----------|-------|
| Width | `26px` |
| Height | `26px` |
| Border-radius | `5px` |
| Font-size (icon) | `14px` |
| Display (at rest) | `display: none` |
| Display (on hover / popover open) | `display: flex` |
| Align / justify | `align-items: center; justify-content: center` |
| Flex-shrink | `0` |

### Visual states

**Rest (hidden):**
```
display: none
```
The button is not rendered at all — zero width, zero height contribution.

**Hover (button visible, popover closed):**
```
display: flex
background: transparent
border: 1px solid transparent
color: var(--text-muted)   /* #9ba5c9 */
```
The button appears but has no visible border or background until the cursor hovers the button itself. Optionally add a subtle hover microstate on the button element itself (e.g. `background: var(--surface-3)` on button:hover) — not defined in the mockup but acceptable.

**Active (popover open):**
```
display: flex
background: var(--accent-dim)          /* rgba(108,92,231,.15) */
border: 1px solid rgba(108,92,231,.4)
color: var(--accent-light)             /* #a78bfa */
```
The active state persists for the duration the popover is open, regardless of cursor position on the row.

### Accessibility

- Element: `<button>` (native button semantics, keyboard-focusable by default).
- `aria-label`: `"Card actions for [card name]"` — do not leave as `⋯` only.
- `aria-expanded`: `"true"` when popover is open, `"false"` when closed.
- `aria-haspopup`: `"menu"` (or `"dialog"` — see Section 8).

---

## 3. Popover Anatomy

All values sourced from `.popover` in `card-row-desktop-popover-2.html`.

### Container

| Property | Value |
|----------|-------|
| Width | `224px` (fixed) |
| Background | `var(--surface-2)` = `#1e2238` |
| Border | `1px solid var(--border)` = `1px solid #2d3258` |
| Border-radius | `8px` |
| Box-shadow | `0 8px 24px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.3)` |
| Z-index | `100` |
| Overflow | `hidden` (clips child border-radii and confirm state swap) |

### Internal layout (top to bottom)

```
┌─────────────────────────────────────────┐
│  [Owned] [Need] [Ordered] [Proxy]       │  ← status pills row
├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤
│  ↗  View all printings                  │  ← nav action
├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤
│  ✕  Remove from deck                    │  ← destructive action
└─────────────────────────────────────────┘
```

Dividers between each section are `1px` lines (`background: var(--border)`) with `margin: 0 10px` — they do not span the full width.

#### Status pills section

Container: `display: flex; gap: 5px; padding: 10px 10px 8px; flex-wrap: wrap`

| Pill | Background | Color |
|------|-----------|-------|
| Owned | `rgba(74,222,128,.15)` | `#4ade80` |
| Need | `rgba(224,83,83,.15)` | `#e05353` |
| Ordered | `rgba(96,165,250,.15)` | `#60a5fa` |
| Proxy | `rgba(192,132,252,.15)` | `#c084fc` |

Pill base: `font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 99px; cursor: pointer; border: 1.5px solid transparent`

Active pill (current status): `border-color: currentColor` — the border color inherits from the pill's text color, producing a same-hue ring that matches the status color without a hardcoded value.

#### Action rows

Container per action: `display: flex; align-items: center; gap: 9px; padding: 9px 12px; cursor: pointer; font-size: 13px; color: var(--text)`

Action icon: `width: 22px; height: 22px; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0`

| Action | Icon glyph | Icon background | Label color |
|--------|-----------|-----------------|-------------|
| View all printings | `↗` | `rgba(96,165,250,.15)` | `var(--text)` = `#eceef8` |
| Remove from deck | `✕` | `rgba(224,83,83,.15)` | `var(--danger)` = `#e05353` |

No hover microstate is defined in the mockup for action rows, but a subtle `background: var(--surface-3)` on row hover is acceptable.

---

## 4. Positioning

### Anchor and default position

The popover is positioned relative to the card row (which has `position: relative` and a `.popover-anchor` class in the mockup):

```
position: absolute
top: calc(100% + 6px)   /* 6px gap below the row */
right: 0                 /* right-aligned to row edge */
```

This places the popover below the row, flush with the right edge. The `⋯` button sits at the right end of `row-line1`, so the popover appears directly beneath it.

### Flip rules

**Vertical flip (flip-up):** When the card row is within **260px** of the viewport bottom, the popover renders above the row instead:
```
bottom: calc(100% + 6px)
top: auto
```
Detect this by reading `element.getBoundingClientRect().bottom` and comparing against `window.innerHeight - 260`.

**Horizontal flip:** The mockup anchors `right: 0` (popover right edge aligns with row right edge), so overflow on the right is not a concern unless the row itself is near the right viewport edge in an unusual layout. If the computed right position would clip the popover, shift left until it clears by 8px. This is an edge case for narrow viewports and can be deferred.

### Z-index and stacking context

- Baseline z-index: `100`.
- The popover must render above list content, table headers, and the sidebar rail. Check for any `z-index` constants already defined in the project and fit within that scale rather than introducing a standalone `100`.
- If any ancestor of the card row creates a stacking context (`transform`, `filter`, `will-change`, `isolation: isolate`), `position: absolute` will be clipped to that ancestor and the `z-index: 100` will not escape it. In that case, render via a React portal (see Section 9).
- No scrim/backdrop on desktop. The popover floats freely with only the box-shadow for visual separation.

---

## 5. Status Pills Section

The status pill row is the first section in the popover, directly communicating the card's current status and allowing immediate one-click changes.

### Behavior

- When the popover opens, the pill matching `currentStatus` in the passed context is pre-selected (active border).
- Clicking a different pill:
  1. Applies the active border to the clicked pill immediately (optimistic UI).
  2. Updates the status pill on the card row in the background (the row re-renders).
  3. Fires the mutation to persist the change.
  4. If the mutation fails, reverts both the popover pill and the row pill, surfaces an error (toast or inline).
- **The popover stays open after a status change.** The user may want to take a second action (e.g. change status then navigate to printings). The popover only closes on explicit dismiss (click-outside, Escape, or ⋯ toggle).

### Pill label vs. row label

The status pills inside the popover use abbreviated labels: **"Owned", "Need", "Ordered", "Proxy"**. The status pill on the card row itself uses the longer label **"Need to buy"** (not "Need"). This is intentional — the popover is a compact control, the row pill has more horizontal space. Implementers should use the short label only inside `CardRowOverflowMenu`.

### Optimistic update scope

Only the status pill on the card row needs to update immediately. The section header counts ("Still need · 48 cards", "Fetched · 27 cards") may recompute on server response, not optimistically, since list reordering adds complexity beyond this spec.

---

## 6. Action List

### View all printings

- Icon background: `rgba(96,165,250,.15)` (blue tint, matches `--info`)
- Icon glyph: `↗`
- Label: `"View all printings"` (13px, `var(--text)`)
- Behavior: external navigation — opens in a new tab. Closes the popover before navigating.
- Open question flagged in the mockup annotations: whether this goes to a new tab or an in-app printings drawer. This spec assumes new tab until resolved; the implementation should wrap the target in a constant so it's one change to switch.

### Remove from deck

- Icon background: `rgba(248,113,113,.15)` (red tint)
- Icon glyph: `✕`
- Label: `"Remove from deck"` (13px, `var(--danger)` = `#e05353`)
- Behavior: does **not** execute immediately. Clicking triggers the confirm state (see Section 7).

---

## 7. Confirm State (Destructive)

When "Remove from deck" is clicked, the popover body is replaced in-place with a confirmation view. The popover container does not close, resize, or reposition — only its inner content swaps.

### Confirm view anatomy

All values from `.pop-confirm` in `card-row-desktop-popover-2.html`.

Container: `padding: 12px 12px 10px`

**Confirm text block:** `font-size: 12px; color: var(--muted); margin-bottom: 10px; line-height: 1.5`

Copy (exact from mockup):
```
Remove [Card Name]?
This will delete it from the deck. This can't be undone.
```

The **entire first line** ("Remove [Card Name]?") is wrapped in `<strong style="color: var(--danger); font-weight: 600">` — not just the card name token. The second line ("This will delete it...") is `var(--text-muted)` weight 400.

**Button row:** `display: flex; gap: 6px`

| Button | Background | Color | Border |
|--------|-----------|-------|--------|
| Cancel | `var(--surface-3)` = `#252a42` | `var(--text-muted)` = `#9ba5c9` | none |
| Remove | `rgba(224,83,83,.2)` | `var(--danger)` = `#e05353` | `1px solid rgba(224,83,83,.3)` |

Button base: `flex: 1; padding: 6px 10px; border-radius: 5px; font-size: 12px; font-weight: 600; cursor: pointer`

### Confirm state behavior

- **Cancel:** Restores the original popover body (status pills + actions). Does not close the popover.
- **Remove (confirm):** Executes the remove mutation optimistically, closes the popover, removes the card row from the list. On mutation failure, restore the row and surface an error.
- **Escape key while in confirm state:** Cancels the confirm step and returns to the main popover body (does not close the popover entirely — Escape from the main body closes the popover).
- **Click-outside while in confirm state:** Closes the popover entirely (same as normal dismiss). The destructive action is not taken.

---

## 8. Dismiss Model

| Event | Result |
|-------|--------|
| Click the `⋯` button while popover is open | Closes popover (toggle) |
| Click outside the popover | Closes popover |
| Press Escape | Closes popover (or cancels confirm state if in confirm) |
| Navigate away from the view | Popover unmounts with the view |
| Select a status pill | Popover stays open |
| Click "View all printings" | Popover closes, navigation fires |
| Click "Remove from deck" | Popover stays open, confirm state activates |

**Click-outside implementation:** Attach a `mousedown` listener to `document` when the popover mounts. Compare `event.target` against the popover element and the `⋯` button (the button's own click handler handles the toggle, so the document listener should exclude it). Remove the listener on popover unmount.

---

## 9. Card Row Line 2 Fix

With the `⋯` button living entirely on line 1, line 2 no longer needs to conditionally show or hide any element. This eliminates the ghost-space bug at its root.

### Fixed line 2 structure

```
.row-line2                         flex row, padding-left: 23px
  .row-line2-left                  flex: 1, min-width: 0
    .set-chip                      flex-shrink: 0
    .alt-name (optional)           truncates via text-overflow: ellipsis
```

**`padding-left: 23px`** — optical alignment so the set chip lines up under the card name (accounting for the checkbox width and gap). Value sourced directly from the mockup's `.row-line2` rule.

**`flex: 1; min-width: 0` on `.row-line2-left`** — the `min-width: 0` override is essential; without it, a flex child will refuse to shrink below its content width, preventing `.alt-name` from truncating. This is the correct way to allow ellipsis in a flex container.

### Rules for conditional elements

Any element on line 2 that is sometimes absent must use **`display: none`** when hidden — never `visibility: hidden`, `opacity: 0`, or `width: 0` with content in flow. Elements that are conditionally absent should simply not be rendered (no DOM node), not toggled via CSS.

At rest and on hover, line 2 is identical — the hover state changes nothing on line 2.

### Card panel container

The card list panel or container that wraps `.card-row` elements must have **`overflow: visible`** (not `overflow: hidden`). Without this, the absolutely-positioned popover will be clipped at the panel boundary and appear cut off. Verify this before implementing — if the panel has a border-radius, `overflow: hidden` is often set alongside it and will need to be removed or scoped.

---

## 10. State Passed into the Popover

The `CardRowOverflowMenu` component receives a context object at open time. Values must not be fetched inside the popover — they come from the card row's already-loaded data.

```
CardRowPopoverContext {
  cardId: string            // stable card identifier for mutations
  cardName: string          // used in confirm copy: "Remove [Card Name]?"
  deckId: string            // deck this row belongs to
  currentStatus: 'owned' | 'need' | 'ordered' | 'proxy'
}
```

Printing details (set code, rarity) are not needed by the popover itself — they live on the row. The popover only needs the card name for confirm copy and the current status to pre-select the active pill.

---

## 11. Keyboard and Accessibility

### ARIA role decision

Use **`role="menu"`** for the main popover body. Rationale: the popover contains a set of commands (status change, navigation, remove). The status pills behave like a selection group within the menu. `role="menu"` is appropriate and aligns with `aria-haspopup="menu"` on the trigger button.

Within the menu:
- Status pill container: `role="group"` with `aria-label="Status"`
- Each status pill: `role="menuitemradio"`, `aria-checked="true/false"` based on whether it is the current status
- "View all printings": `role="menuitem"`
- "Remove from deck": `role="menuitem"`
- Confirm state: when active, the confirm view replaces the `role="menu"` region. The confirm container should be `role="alertdialog"` with `aria-modal="false"` (it's not a true modal — the user can still click outside to dismiss).

### Trigger button

```html
<button
  aria-label="Card actions for Lightning Bolt"
  aria-expanded="false"
  aria-haspopup="menu"
>
  ···
</button>
```

`aria-expanded` updates to `"true"` when the popover opens.

### Focus management

**On open:**
- Move focus to the first focusable element inside the popover immediately after mount — the "Owned" status pill.
- Do not wait for an animation to complete before moving focus.

**Within the popover:**
- Tab moves through focusable elements in DOM order.
- Arrow keys (up/down) should move between the status pills and action rows when `role="menu"` is used, per ARIA authoring practices for menus.
- Arrow keys (left/right) move between status pills within the `role="group"`.
- Space/Enter on a status pill selects it; Space/Enter on an action fires the action.

**On close:**
- Return focus to the `⋯` button that triggered the popover.
- The `⋯` button must be programmatically focusable (`tabindex="-1"` is not needed since it is a native `<button>`, but ensure it is not `display: none` at the moment focus returns — the hover state must remain active until after focus transfer completes).

**Escape key behavior:**
- From main popover body: close popover, return focus to `⋯` button.
- From confirm state: cancel confirm, return to main popover body (do not close popover).

---

## 12. Token Reference

All values extracted from `card-row-desktop-popover-2.html`. Conflicts with `card-row-mockup.html` are noted.

| Token | Value | Usage in this spec |
|-------|-------|--------------------|
| `--bg` | `#0d0f1a` | App background |
| `--surface` | `#151829` | Card row background (rest) |
| `--surface-2` | `#1e2238` | Card row background (hover/popover-open); popover background |
| `--surface-3` | `#252a42` | Confirm state Cancel button background |
| `--border` | `#2d3258` | Row borders, popover border, dividers |
| `--accent` | `#6c5ce7` | Row hover border (from mockup) |
| `--accent-hover` | `#8b7cf8` | — |
| `--accent-light` | `#a78bfa` | ⋯ button color when active |
| `--accent-dim` | `rgba(108,92,231,.15)` | ⋯ button background when active |
| `--text` | `#eceef8` | Primary text, action row labels |
| `--text-muted` | `#9ba5c9` | ⋯ button color at rest, confirm body text, Cancel button text |
| `--success` | `#4ade80` | Owned pill text; acquired row left border |
| `--danger` | `#e05353` | Remove from deck label; confirm card name; Remove button — canonical `--fl-danger` |
| `--warn` | `#fbbf24` | (not used in desktop popover) |
| `--info` | `#60a5fa` | View all printings icon tint base |
| `--proxy` | `#c084fc` | Proxy pill text |

### Token conflicts between source files

| Token | `card-row-desktop-popover-2.html` | `card-row-mockup.html` | Resolution |
|-------|----------------------------------|----------------------|------------|
| `--danger` | `#f87171` | `#e05353` | **Use `#e05353`** — canonical `--fl-danger` value from `colors_and_type.css`. The `#f87171` in the popover file was erroneously derived from `--fl-src-buy-fg` (the "Need to buy" source tag foreground), not the danger semantic token. |
| `--muted` / `--text-muted` | `--muted: #9ba5c9` | `--text-muted: #9ba5c9` | Same resolved hex, different property name. **Use `--text-muted`** — matches canonical `--fl-text-muted` naming. |
| `--surface-3` | `#252a42` | _(not defined)_ | Present only in the popover file. Add to the global token sheet if not already present. |
| `--accent-dim` | `rgba(108,92,231,.15)` | _(not defined)_ | Same as above — add to token sheet. |

---

## 13. Implementation Notes

### Component boundary

`CardRowOverflowMenu` is a self-contained component that manages:
- The `⋯` button (rendered inline in `CardRow`'s `row-line1`)
- Open/closed state (`useState`)
- The popover (rendered via portal)
- The confirm state (internal to the popover, switched via local state)

```
CardRow
  row-line1
    ... existing children ...
    <CardRowOverflowMenu
      cardId={...}
      cardName={...}
      deckId={...}
      currentStatus={...}
    />
  row-line2
    (chip + alt-name only — no overflow button, no conditional elements)
```

`CardRowOverflowMenu` renders:
1. The `⋯` `<button>` inline (inside the row's DOM, in flow)
2. The popover via `ReactDOM.createPortal` into a `#overlay-root` or `document.body`

### Portal necessity

The popover must render in a portal if any ancestor of `.card-row` has a stacking context or `overflow: hidden`. The list container may clip a `position: absolute` child. Verify by rendering without a portal first — if the popover is clipped, add the portal. Portaling is the safer default.

The `⋯` button stays in the row DOM (not portaled) because it is the layout anchor and focus-return target. Only the floating popover is portaled.

### Existing primitives

Before implementing positioning logic from scratch, search the codebase for:
- Any existing popover, dropdown, or tooltip component — reuse its `useClickOutside` hook and flip logic.
- Any existing `usePortal` or `createPortal` usage — follow the same pattern and portal root.
- The buy-flow sheet likely has an `Escape` key handler — extract the hook if it is reusable.

### Pointer events and the checkbox carve-out

Do not set `pointer-events: none` on the row to implement the carve-out — this would disable all interaction. The checkbox receives events normally. The row's `onClick` handler is the guard (see Section 1).

### Row background on popover-open

When the popover is open, the card row should hold the hover background (`var(--surface-2)`) even if the cursor has moved away. Manage this via a boolean that mirrors the popover open state, applied as a class on the row (e.g. `.popover-open` → `background: var(--surface-2)`).

### Open questions (from mockup annotations, unresolved)

These are flagged in the mockup but not resolved by the design. Flag them before implementation:

1. **Right-click trigger** — no mockup shows the anchor point for a right-click. The above spec defaults to anchoring at the `⋯` button. Confirm this is acceptable.
2. **"View all printings" destination** — new browser tab vs. in-app printings drawer. The mockup icon (`↗`) implies external, but this was called out as unresolved.
3. **Flip threshold** — 260px from viewport bottom is the mockup's annotation value but noted as untested. May need adjustment after seeing real list heights.
