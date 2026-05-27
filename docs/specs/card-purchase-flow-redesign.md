# Card Purchase Flow — Structural Redesign

**Date:** 2026-05-25  
**Prereq:** `card-purchase-audit.md`  
**Scope:** Logic and decision ordering only — not visual design.

---

## The core reframe

The current flow treats the buy list as a **filtered view** of the checklist. That's why it requires a filter step before anything can happen — the list only exists when you ask for it.

The better mental model is a **persistent cart**. A cart accumulates as you tag cards. It exists independently of what you're currently viewing or filtering. It's always actionable. You don't open it by filtering; you open it because it's there.

That single reframe eliminates most of the problems in the audit.

---

## What changes structurally

### 1. Decouple Shop from filter state

**Now:** Shop only appears when `filterSource === "need_to_buy"`. Activating the buy filter is a prerequisite to shopping.

**Better:** Shop (or equivalent send action) is available whenever `toBuyTotal > 0`, regardless of what filter is active or what the user is currently viewing.

The filter for *viewing* buy cards and the action for *sending* them are independent intents. They share no required ordering. Remove the dependency entirely.

---

### 2. The "N to buy" pill becomes an entry point, not a filter toggle

**Now:** Clicking "N to buy" filters the checklist in place. Shop appears as a side effect.

**Better:** Clicking "N to buy" opens the buy list as a focused view or panel — the list, card count, and send action are all in one place. Filtering the checklist is a separate concern.

This also means the buy list is readable without disrupting whatever the user was doing in the checklist. They can check the list and dismiss it without losing their place.

---

### 3. Collapse vendor send and order creation into one round trip

**Now:** Send to vendor → app is done → user manually navigates to Orders → recreates the card list from scratch.

**Better:** Send to vendor → order draft is automatically created from the buy list → user confirms or dismisses.

The order draft requires no new decisions at send time. It pre-populates from data that already exists: the card names, quantities, and deck associations are all in `toBuyCards`. The vendor is already known. The only fields that genuinely need user input later are tracking number and expected arrival — both of which the user doesn't have until the vendor confirms shipment anyway.

This collapses two separate sessions (buy now, track later) into one continuous flow.

---

### 4. Default vendor to last used — only ask when there's no history

**Now:** The vendor dropdown presents three choices cold, with no context, every time.

**Better:** If `recentVendors` has an entry, the primary send action uses it by default. The user sees "Send to Manapool (12)" — one tap. A secondary control lets them change vendor if needed.

The choice is still available; it's just no longer a blocking step on every purchase.

---

### 5. Always show card count on the send action

**Now:** Count appears on "N to buy," disappears when moving to "Shop ▾."

**Better:** The count travels with the action. Whatever button triggers the send shows the number of cards being sent. The user never loses that confirmation.

---

## Step comparison

### Current flow
1. Tag card as `need_to_buy` (×N, one at a time)
2. Notice "N to buy" pill has appeared
3. Click "N to buy" pill ← filter activation; also unlocks Shop
4. Notice "Shop ▾" has appeared
5. Click "Shop ▾"
6. Pick a vendor from the dropdown (no context, three choices)
7. If TCGPlayer/CK: manually paste clipboard into vendor tab
8. Navigate to Orders tab
9. Create new order from scratch with same cards

**9 steps. Steps 3, 4 are invisible coupling. Steps 8–9 are full duplication.**

### Proposed flow
1. Tag card as `need_to_buy` (×N — bulk tagging addressed separately)
2. "Buy list (N)" entry point is visible and actionable
3. Open buy list → review cards → tap "Send to [last vendor]"
4. Vendor receives list; order draft auto-created in background
5. Optional: confirm/edit the draft order (tracking number etc. can be added when it ships)

**5 steps. No invisible state. No duplication. Steps 4–5 can be deferred without breaking the flow.**

---

## Decisions removed

| Decision | Why it can be removed |
|---|---|
| Filter activation as prerequisite to Shop | Shop doesn't depend on filter state in the new model |
| Manual order creation after sending | Auto-drafted from the same data that was just sent |
| "How many cards?" uncertainty at send time | Count is always shown on the action |

## Decisions deferred

| Decision | When it moves to |
|---|---|
| Vendor choice | Only asked if no recent vendor; otherwise defaults |
| Tracking number | Added to the order when the shipment confirmation arrives |
| Order confirmation | Offered after send as a non-blocking follow-up, not required to complete the purchase |

---

## What this does not change

- How cards are tagged (`need_to_buy` source tag, source picker, bulk select) — that's a separate concern
- The Orders data model — `Order` and `OrderCard` already support everything needed; `orderCards` just gets pre-populated instead of manually entered
- Vendor list contents — Manapool, TCGPlayer, Card Kingdom stay the same; the change is to default and presentation, not to the send mechanism
- The checklist filter — "N to buy" as a filter still exists for users who want to view and work on their buy list inline; it just isn't required to reach the send action

---

## Open questions for design

1. **Where does the buy list entry point live?** Options: persistent button in the deck header (visible whenever `toBuyTotal > 0`), a count badge in the nav, or a slide-out panel. The constraint from memory is minimal invasiveness.
2. **What does the order draft confirmation look like?** A toast with "Order created — view it" is probably sufficient. It should not interrupt the purchase action itself.
3. **What happens to the per-deck "N to buy" pill in the checklist filter row?** It can stay as a filter shortcut — it just stops being the gate to Shop.
