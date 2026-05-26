# Card Purchase Flow — Design Handoff

**Date:** 2026-05-25  
**Prereqs:** `card-purchase-audit.md`, `card-purchase-flow-redesign.md`  
**Prototype:** `card-purchase-flow.html` (Open Design project — 12 annotated states)

---

## What changed and why (one paragraph)

The old flow coupled the send action to a filter state — Shop only appeared when `filterSource === "need_to_buy"` was active, which meant clicking a filter pill was an invisible prerequisite to shopping. The redesign decouples them entirely: a persistent **buy bar** surfaces whenever `toBuyCards.length > 0`, regardless of what the user is viewing or filtering. Tapping it opens a **buy list sheet** — a focused panel showing the full buy list and a pre-selected vendor. The send action lives there. After sending, an **order draft is auto-created** from the buy list data so the user doesn't have to manually recreate it in the Orders tab. Error states that previously failed silently (clipboard denied, popup blocked) now surface recovery actions.

---

## Screen inventory

| # | Screen | Step | States covered |
|---|--------|------|----------------|
| 1 | Checklist — buy bar visible | Entry | has buy cards |
| 2 | Checklist — buy bar hidden | Entry | no buy cards |
| 3 | Buy list sheet — returning user | Buy list | last vendor pre-selected |
| 4 | Buy list sheet — first use | Buy list | no vendor history |
| 5 | Buy list sheet — empty | Buy list | no buy cards when sheet opens |
| 6 | Vendor picker | Vendor | idle + selectable |
| 7 | Sending — Manapool | Sending | tab-based vendor, loading |
| 8 | Sending — TCGPlayer | Sending | clipboard vendor, loading |
| 9 | Success — Manapool | Success | tab opened + order draft |
| 10 | Success — TCGPlayer | Success | clipboard copied + order draft |
| 11 | Error — clipboard denied | Errors | manual copy fallback |
| 12 | Error — popup blocked | Errors | manual open fallback |

---

## What's new

### Buy bar

A slim contextual strip that appears between the filter row and the card list whenever `toBuyCards.length > 0`. It is sticky at `top: 56px` (directly below the app header).

```
┌──────────────────────────────────────────────────────┐
│  ● 12 cards to buy                    Buy list →     │  ← buy-bar
└──────────────────────────────────────────────────────┘
```

**Design tokens:**
- Background: `rgba(239, 68, 68, 0.07)`
- Border-bottom: `1px solid rgba(239, 68, 68, 0.18)`
- Label + button color: `#f87171` (`--fl-src-buy-fg`)
- Button background: `rgba(239, 68, 68, 0.14)`
- Height: ~40px, padding `9px 16px`

**Behavior:**
- Render when `toBuyCards.length > 0`; hide (don't show a zero state) when empty
- Tapping the bar or the "Buy list →" button opens the buy list sheet
- The "N to buy" filter pill in the filter row **remains** — it's a view filter, not the entry to Shop

---

### Buy list sheet

A bottom sheet that opens over the checklist. It shows all need-to-buy cards and the send action in one place.

**Structure:**
```
┌─────────────────────────────────────┐
│        (drag handle)                │
│  Buy list                  ×        │  ← sheet header
│  12 cards                           │
├─────────────────────────────────────┤
│  1  Lightning Greaves               │
│  1  Sol Ring                        │  ← scrollable card list
│  1  Arcane Signet                   │
│  … 9 more                           │
├─────────────────────────────────────┤
│  🟣  Manapool                Change │  ← vendor row (footer)
│      Last used today                │
│  [ Send to Manapool (12) ]          │  ← primary CTA
└─────────────────────────────────────┘
```

**Vendor row (returning user):** Read `localStorage.getItem("lastVendor")`. Show vendor name, last-used date, and a "Change" link that opens the vendor picker within the same sheet.

**First use (no `lastVendor`):** Replace vendor row + send button with a single "Choose vendor to send →" button that opens the vendor picker.

**Empty state (no buy cards):** Render `<EmptyState>` with "Buy list is empty" and an explanation. No send button, no vendor row.

---

### Vendor picker

A structured sheet replacing the old flat dropdown. Shown only on first use or when "Change" is tapped.

Each option shows:
- Vendor name
- Send method description: "Opens prefilled tab in your browser" or "Copies list to clipboard — paste in tab"
- Last used date (or "Never used")

On "Continue":
1. Save chosen vendor: `localStorage.setItem("lastVendor", vendorId)`
2. Close picker
3. Return to buy list sheet with vendor pre-filled

---

### Auto order draft

After a successful send, create an order draft automatically:

```ts
const draft: Order = {
  id: nextOrderId(),
  status: 'pending',
  vendor: vendorId,
  createdAt: new Date().toISOString(),
  orderCards: toBuyCards.map(c => ({
    cardName: c.name,
    quantity: c.quantity,
    deckId: c.deckId,
  })),
  trackingNumber: null,
  expectedArrival: null,
};
```

The `Order` and `OrderCard` types already support this — `orderCards` just gets pre-populated instead of manually entered.

**Do not:** auto-clear `need_to_buy` tags after the draft is created. Let users clear them manually when cards arrive — this matches the existing receive/check-off pattern.

---

### Error states

#### Clipboard denied

When `navigator.clipboard.writeText()` throws `NotAllowedError`:

1. Show error view with warning icon
2. Render a `<textarea readonly>` pre-populated with the full list text, pre-selected on mount (`el.select()`)
3. "Retry clipboard copy" button — calls the same send function inside a user-gesture handler (browser is more likely to grant permission this way)
4. Do **not** create an order draft — wait for a successful send

#### Popup blocked

Detect immediately after `window.open()`:

```ts
const win = window.open(url, '_blank');
if (!win || win.closed || typeof win.closed === 'undefined') {
  // popup was blocked
  setError('popup-blocked');
  setSendUrl(url); // store so the manual button can use it
}
```

Show the manual "Open Manapool →" button using the stored URL. Do **not** create an order draft.

---

## What changed

| Old behaviour | New behaviour |
|---|---|
| Shop button only appeared when `filterSource === "need_to_buy"` | "Buy list →" in the buy bar is always accessible when `toBuyCards.length > 0` |
| Shop ▾ was a button in the filter row | Send action lives in the buy list sheet (not a filter) |
| Vendor chosen from a cold dropdown on every send | Vendor pre-selected from last used; picker only shown on first use or "Change" |
| Card count disappeared at the Shop step | Count is on the send button: "Send to Manapool (12)" |
| 2.5 s vanishing checkmark | Persistent success view with order draft + "View order" CTA |
| Clipboard write failed silently | Clipboard-denied error shows manual copy fallback |
| Popup block showed a success checkmark | Popup-blocked error shows manual open button |

---

## What's unchanged

- `need_to_buy` source tag — same value, same label, same source picker
- The "N to buy" filter pill in the checklist — still works as a view filter; it just no longer gates the send action
- Vendor list contents — Manapool, TCGPlayer, Card Kingdom
- Actual send mechanisms — `window.open(url)` for Manapool, `navigator.clipboard.writeText()` for TCGPlayer and Card Kingdom
- `Order` and `OrderCard` data types — no schema changes needed
- How cards are individually tagged — source picker, bulk tag, etc.
- Progress bar buy-chip as an entry point to the buy filter — it can still activate the view filter; it should also open the buy list sheet if `toBuyCards.length > 0`

---

## Open questions

1. **After send: offer to bulk-retag?** The success view currently just shows the draft. Consider a non-blocking prompt: "Mark these 12 cards as Ordered?" This would transition `need_to_buy` → `ordered` in one step. Decision deferred — not blocking the send flow.

2. **Cross-deck buy list.** The redesign works within a single deck. Issue #55 proposes a cross-deck buy list. The buy bar and sheet are compatible with this — `toBuyCards` just needs to span multiple decks. Leave this for a follow-on.

3. **Clipboard format differences.** TCGPlayer and Card Kingdom have different import formats. The current `handleSendToVendor` already formats per-vendor. Verify the format string is correct for each before shipping.

---

## Files

| File | What it is |
|---|---|
| `docs/specs/card-purchase-audit.md` | UX audit — root causes |
| `docs/specs/card-purchase-flow-redesign.md` | Structural redesign spec |
| `docs/specs/card-purchase-handoff.md` | This file — visual design handoff |
| `card-purchase-flow.html` (Open Design project) | Interactive prototype, 12 annotated states |

---

## Related issues

- **#55** — per-deck buy flow + cross-deck buy list
- **#41** — per-card receive / partial shipments
- **#42** — order price tracking and spend rollup
