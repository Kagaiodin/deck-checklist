# deck-checklist — Backlog

_Updated: 2026-06-01. One item per session. Check here before starting work._

---

## In Progress

### Collection "Free" label rename
**Branch:** `ux/design-review-fixes`  
**Spec:** none (small rename)  
**Last state:** Paused mid-session on label wording.  
**Open question:** Label wording — decision with user. Predicate is confirmed correct (`total - committed > 0` = spare copies not consumed by any deck). "Not in a deck" was ruled out as misleading. Options on the table: **"Unassigned"** or **"Has spares"**.  
**Touches:** `src/features/collection/components/CollectionControls.tsx` (pill label), `CollectionRow.tsx` (subtitle text + partially-free badge).

---

## Ready

### Card row desktop popover
**Spec:** `docs/specs/card-row-desktop-popover-spec.md`  
**Design source:** Open Design — `card-row-desktop-popover-2.html`, `card-row-mockup.html`  
**What it is:** A `⋯` overflow button on card row hover that opens a positioned popover with status pills, "View all printings," and "Remove from deck" (with confirm step). Also fixes the line-2 ghost-space bug caused by `visibility: hidden` on the printings link.  
**Depends on:** Nothing — can ship independently of the mobile sheet.

### Card row mobile sheet
**Spec:** `docs/specs/card-row-contextual-layer-spec.md`  
**Design source:** Open Design — `card-row-sheet-mobile-2.html`  
**What it is:** Bottom sheet triggered by tapping anywhere on a card row (except the checkbox). Shows card name/meta, status pill row, printings link, swap printing, add to buy list, and remove from deck. Includes swipe-to-dismiss, scroll lock, and focus trap.  
**Depends on:** Can ship independently; pairs well with desktop popover above.

### Mobile deck picker: add "Create blank deck"
**Spec:** none  
**What it is:** The mobile deck picker sheet currently only has "Import Deck" in the footer. Add a "+ Create blank deck" button alongside it. Desktop sidebar already has this path.  
**Touches:** `src/App.tsx` around line 846 (deck-picker-footer), deck creation logic in store.

### Design review: cancel affordance audit
**Spec:** none  
**What it is:** Three different dismiss patterns exist across the app (Escape, tap-scrim, close button). Needs a manual walkthrough to confirm all sheets/modals are consistent. Not a code change until the audit identifies specific gaps.

---

## Backlog (needs design or more scoping)

### Deck inventory conflict banner
**Ref:** Issue #80  
**What it is:** On deck open, check each owned-tagged card against free collection copies (total − checked-off in other decks). If any card is short, show a dismissible banner at the top of the deck listing the conflicts and shortfall counts. No banner when collection isn't loaded.  
**Design direction:** Top-of-deck notification banner, fires on deck open, dismissible, non-blocking.  
**Depends on:** #79 (merged — defines what "free copies" means).  
**Touches:** New `useInventoryConflicts` hook + new `InventoryConflictBanner` component; deck view in `src/App.tsx`.

### Cross-deck buy list
**Ref:** Issue #55, `docs/specs/card-purchase-handoff.md` (open question 2)  
**What it is:** The buy bar and buy list sheet currently scope to the active deck. This extends `toBuyCards` to span multiple decks. The buy flow redesign was intentionally built to be compatible — this is a follow-on.

### Per-card receive / partial shipments
**Ref:** Issue #41  
**What it is:** When an order arrives, allow marking individual cards (or partial quantities) as received rather than flipping the whole order to "received." Affects order data model and the order row UI.

### Order price tracking and spend rollup
**Ref:** Issue #42  
**What it is:** Per-order price field and a spend summary view. Likely needs a design pass before implementation.

### Post-send "mark as Ordered" bulk retag
**Ref:** `docs/specs/card-purchase-handoff.md` open question 1  
**What it is:** After sending to a vendor and auto-creating an order draft, offer a non-blocking prompt: "Mark these N cards as Ordered?" This transitions `need_to_buy` → `ordered` in one step. Deferred from the buy flow redesign.

---

## Done (recent)

| Feature | Commit / PR |
|---------|-------------|
| Sidebar left-anchor fix on wide screens | PR #77 |
| Mark deck as built (import + toggle + auto) | PR #76 |
| Extra Info section — tokens + alt printings | `4b5e158` |
| Token chips with creator tooltip + section nav | `7e68269` |
| Design review fixes (4 findings) | `fc3a430` |
| Sidebar collapsible rail mode | `c59553c` |
| Card row collapse to single-line layout | `7b8292b` |
| Late order stripe → danger red | `641ac96` |
| Light mode `color-scheme` fix | `5640959` |
| Buy list modal + vendor picker redesign | PR #65 |
| Empty state CTA hierarchy redesign | PR #73 |
| Escape key dismisses buy flow | PR #72 |
| Theme controls → settings popover | PR #62 |
| Light mode + 4 accent variants | PR #58 |
| Collection undo toast | PR #68 |
| First-run onboarding modal | PR #56 |
| Full collection page refactor | PR #47 |
| Order tracking | PR #39 |
