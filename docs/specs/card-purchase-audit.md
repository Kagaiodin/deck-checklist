# Card Purchase Flow — UX Audit

**Date:** 2026-05-25  
**Scope:** Everything involved in tagging cards as need-to-buy, sending them to a vendor, and connecting that action to an order.  
**Files audited:** `src/components/Checklist.tsx`, `src/App.tsx`, `src/types/index.ts`

---

## 1. Too Many Steps

The purchase path requires 5–6 discrete interactions before anything is actually sent to a vendor:

1. Open the source picker on each card individually
2. Select "Need to buy"
3. Notice the **"N to buy"** pill has appeared
4. Click the pill (intent: view list — side effect: unlocks Shop)
5. Notice **"Shop ▾"** has appeared
6. Click Shop, pick a vendor
7. *(If TCGPlayer or Card Kingdom)* manually paste clipboard into the vendor tab

Steps 4 and 5 are invisible cause-and-effect. The user clicks a filter pill and a new button materialises — but nothing communicates that clicking the filter *was required* to unlock shopping. Users who skip step 4 (e.g. they clicked the buy chip in the progress bar instead) may never discover the Shop button at all.

**Root cause:** Shop visibility is coupled to `filterSource === "need_to_buy"` (Checklist.tsx:591). Filter state and action availability are the same variable.

---

## 2. Unclear State Feedback

### 2a. The "sent" confirmation vanishes in 2.5 seconds
After sending to a vendor, `sentVendor` shows a checkmark on the vendor's label for 2,500 ms and then resets to null. There is no persistent record that the send happened. If the user navigates away and returns, or simply blinks, there is no indication they already sent this list anywhere.

### 2b. No count on the Shop pill
The buy pill reads "12 to buy." The Shop pill reads "Shop ▾." The card count disappears between the two interactions. By the time the user opens the vendor dropdown, they have lost the quantity confirmation they had one click earlier.

### 2c. Clipboard-only vendors give no feedback about what was copied
For TCGPlayer and Card Kingdom, `handleSendToVendor` calls `navigator.clipboard.writeText()` silently (App.tsx:623). The browser provides no native confirmation. The user opens the vendor tab not knowing whether the clipboard write succeeded, what format the data is in, or how to paste it.

### 2d. Two entry points to the same filter diverge visually
Clicking the buy chip in the segmented progress bar and clicking the "N to buy" pill both activate `filterSource === "need_to_buy"` and both make Shop appear — but they look and behave differently, land in different scroll positions, and give different visual feedback. Users who use the progress bar never see the "N to buy" pill activate; users who use the pill may not know the progress bar is also interactive.

---

## 3. Missing Loading and Error States

### 3a. Clipboard write has no error handling
`navigator.clipboard.writeText()` is an async operation that can fail (permissions denied, insecure context, browser policy). The call in App.tsx:623 is awaited but has no catch path. If it fails silently, the user opens the vendor tab with an empty clipboard and no explanation.

### 3b. No empty state on the buy list
If a user clears all `need_to_buy` tags while the buy filter is active, the card list empties and the "N to buy" pill disappears — but the Shop pill may remain momentarily visible (it depends on render order) and the filter remains active, showing an empty "No cards with this source tag" message. There is no dedicated empty state that says "your buy list is empty."

### 3c. No loading state for Manapool prefill
`window.open()` is fire-and-forget. If the tab is blocked by a popup blocker, nothing in the app acknowledges it. The user sees the checkmark as if the action succeeded when the vendor tab never opened.

---

## 4. Confusing Navigation

### 4a. An action button lives in a filter row
Shop ▾ is rendered inside `filter-pills-row` alongside "Missing only," "Group ▾," and "More ▾." Filter pills narrow a view — they are reversible, low-stakes, and read as display preferences. Shop is an external, irreversible action that sends data to a third party. Placing it in the filter row trains the user to read it as another display option, not a meaningful action. It is easy to dismiss or overlook.

### 4b. The flow terminates inside a vendor tab with no way back
After clicking a vendor, the app's job is done — there is no follow-through. The user is now in a vendor tab, has placed an order, and must manually return to the app, navigate to Orders, and recreate the full card list from scratch. The buy flow and the Orders system share no state, no bridge, and no awareness of each other.

### 4c. "Need to buy" is one tag among eight
The source picker presents eight acquisition states in a flat list: Owned, Ordered, Proxy, In another deck, Need to buy, Borrowed, In binder, In storage. "Need to buy" is not visually or positionally distinguished as the one that activates a purchase workflow. A new user scanning the list has no reason to expect it to behave differently from "Borrowed" or "In binder."

---

## 5. Forced Decisions the User Isn't Ready For

### 5a. Tagging must happen before shopping — no way to build a list then tag
The only way to add a card to the buy list is to tag it `need_to_buy` one row at a time. There is no "add to buy list" affordance, no scratch pad, no bulk "mark all untagged as need to buy." A user who imports a deck and wants to send the whole thing to a vendor must tag each card individually before the Shop button appears.

### 5b. Vendor choice happens with no context
The Shop dropdown presents three vendors cold: Manapool, TCGPlayer, Card Kingdom. There is no indication of which was used last time, no estimated card count, no hint that two of the three require a manual paste step the user hasn't been warned about. The user is asked to decide without information.

### 5c. No prompt to create an order after sending
After sending to a vendor, the natural next question is "how do I track this?" The app never asks. The Orders tab is a peer nav item with no relationship to the buy flow. A user who doesn't already know the Orders tab exists will never think to use it as a follow-up to shopping.

---

## Summary

The flow feels clunky because it asks the user to perform a filtering action (activate the buy filter) in order to unlock a purchasing action (Shop), gives almost no feedback that either step worked, and then drops them at the vendor with no path back. The cause isn't any single bug — it's a structural coupling between view state and action availability, combined with the absence of a feedback loop between buying and order tracking.

### Prioritised pain points

| # | Finding | Severity |
|---|---------|----------|
| 1 | Shop gated behind filter activation — invisible coupling | High |
| 2 | No bridge from vendor send to Orders | High |
| 3 | Action button in filter row — wrong affordance | High |
| 4 | Clipboard write has no error handling or confirmation | Medium |
| 5 | "Sent" confirmation disappears in 2.5 s, no persistence | Medium |
| 6 | No card count on Shop pill | Medium |
| 7 | Two entry points to buy filter, divergent UX | Medium |
| 8 | Tagging is one-at-a-time with no bulk shortcut | Medium |
| 9 | Vendor choice offered with no context or history hint | Low |
| 10 | Popup blocker silently swallows Manapool send | Low |

---

## Related Issues

- **#55** — per-deck buy flow review + cross-deck buy list (patches symptoms of findings 1, 2, 6)
- **#41** — per-card receive / partial shipments
- **#42** — order price tracking and spend rollup
