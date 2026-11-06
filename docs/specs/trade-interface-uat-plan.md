# Trade Interface — UAT Plan

Branch: `feat/trade-interface` · Issue: #114 · Spec: `docs/specs/trade-interface-spec.md`

Manual acceptance testing of the built feature against the spec's confirmed decisions. Automated tests cover the pure logic (pricing, fairness, share encode/decode, reducer); this plan covers what they can't: real Scryfall data, real browsers, layout, and feel.

**Status key:** ☐ not run · ✅ pass · ❌ fail (note issue #) · ➖ n/a

## 0. Setup

- Run `npm run dev` (desktop) and open the same URL on a phone or a 390px-wide devtools viewport.
- Have a populated Collection (import a CSV with ≥10 cards, at least one foil and one card that's in a deck) and one **empty-collection** profile/browser window.
- Test browsers: Chrome + Safari desktop, iOS Safari (or Chrome device emulation). Firefox spot check for share links (`CompressionStream`).
- Before each section that says "fresh", clear localStorage key `fetchlist-trade`.
- Useful test cards: **Sol Ring** (cheap, many printings), **Black Lotus** (expensive, no-price edge), a foil-only printing, an etched printing, a card with no USD price (e.g. a token or very new promo).

## 1. Entry point and navigation

| # | Steps | Expected | Status |
|---|---|---|---|
| 1.1 | Desktop: Collection tab → ⋯ menu | "Trade calculator" item sits below a separator, no icon, no badge, helper line "Weigh a trade. Your collection only changes if you log it." | ☐ |
| 1.2 | Mobile: Collection → overflow sheet | Same item and helper line | ☐ |
| 1.3 | Click it | Trade opens on its own route; breadcrumb reads Collection › Trade | ☐ |
| 1.4 | Click "Collection" in breadcrumb | Returns to Collection, unchanged | ☐ |
| 1.5 | Browser back/forward from Trade | Sensible history, no blank screen | ☐ |
| 1.6 | Collection chrome, rows, stats | **No** trade state anywhere (vision check) | ☐ |
| 1.7 | Reload while on the Trade route | Trade page reloads in place (Workers SPA fallback) | ☐ |
| 1.8 | Click a top-level tab while on Trade | Leaves Trade; no errors | ☐ |

## 2. Layout

| # | Steps | Expected | Status |
|---|---|---|---|
| 2.1 | Desktop ≥1024px | Three panels: My offer / Controls / Their offer, per spec layout | ☐ |
| 2.2 | Resize down through tablet widths | No overlap, no horizontal scroll, panels reflow or switch to mobile layout cleanly | ☐ |
| 2.3 | Mobile ≤ ~600px | Sticky verdict bar (meter + both totals) + Mine/Theirs tabs | ☐ |
| 2.4 | Mobile: tap the verdict bar | Controls open in a bottom sheet | ☐ |
| 2.5 | Close sheet via scrim tap, Esc, close button | All three work (swipe-down is intentionally not built) | ☐ |
| 2.6 | Light and dark mode, plus each accent variant | Legible contrast, meter zones distinguishable, no template h1/h2 styles bleeding in | ☐ |
| 2.7 | Long card names, 30+ rows | Rows truncate gracefully; panel scrolls, verdict bar stays visible | ☐ |

## 3. Adding cards

### 3a. Scryfall search (both sides)

| # | Steps | Expected | Status |
|---|---|---|---|
| 3.1 | My offer → Search cards; type "sol r" | Autocomplete appears after brief debounce (~250 ms), no request per keystroke | ☐ |
| 3.2 | Pick Sol Ring | Printing list shows; choose one; row is added with image, set, collector #, price | ☐ |
| 3.3 | Same on Their offer | Works identically | ☐ |
| 3.4 | Search nonsense ("zzzqqq") | Friendly empty state, no crash | ☐ |
| 3.5 | Go offline (devtools), search | Friendly error, sheet still closable | ☐ |
| 3.6 | Add card with no USD price | Row shows "No price", contributes $0, missing-price warning appears | ☐ |
| 3.7 | Mobile | Search opens as a bottom sheet | ☐ |
| 3.8 | Network tab | Requests spaced ≥50 ms; no auth headers; only `api.scryfall.com` | ☐ |

### 3b. Collection picker (My side only)

| # | Steps | Expected | Status |
|---|---|---|---|
| 3.9 | Their offer panel | **No** "From collection" button | ☐ |
| 3.10 | My offer → From collection | Picker lists collection cards; search/filter works | ☐ |
| 3.11 | Pick a printing with 2 owned | Set / collector # / foil prefilled; quantity capped at 2 | ☐ |
| 3.12 | Try to raise quantity past owned | Blocked at cap | ☐ |
| 3.13 | Pick a card that's in a deck | Row shows "N in decks" flag; still selectable | ☐ |
| 3.14 | Pick several cards at once | Added in one batch; a single undo removes them all | ☐ |
| 3.15 | Pick a collection entry with no printing (order-receipt import) | Resolves to newest printing; if price lookup fails, added unpriced | ☐ |
| 3.16 | Collection unchanged after adding | Quantities not decremented | ☐ |
| 3.17 | Empty collection | Picker shows a helpful empty state | ☐ |
| 3.18 | Add cards to Collection, then reopen Trade | Picker sees the new cards (reads fresh from storage) | ☐ |
| 3.19 | Search-sourced row | Never capped, shows no "in decks" flag | ☐ |

## 4. Card row editing

| # | Steps | Expected | Status |
|---|---|---|---|
| 4.1 | Change quantity | Line total and side subtotal update immediately | ☐ |
| 4.2 | Quantity to 0 / blank / negative | Clamped to ≥1 or row removal is explicit; no NaN | ☐ |
| 4.3 | Change finish nonfoil → foil | Price re-fetches; new price differs; spinner/feedback shown | ☐ |
| 4.4 | Change to a finish the printing lacks | Finish unchanged, toast explains why | ☐ |
| 4.5 | Change condition NM→LP→MP→HP→DMG | Price = base × 100/90/75/55/40% (check against price breakdown) | ☐ |
| 4.6 | Open price breakdown popover | Shows base, condition, discount, unit price; matches by-hand math | ☐ |
| 4.7 | Set manual price | Condition ignored; discount **still applies**; "Counts as $X after −N%" preview is right | ☐ |
| 4.8 | "Use fetched price" | Reverts to fetched × condition | ☐ |
| 4.9 | Manual price on a "No price" row | Row prices correctly, missing-price warning clears | ☐ |
| 4.10 | Per-card discount override | Overrides side and global for that row only | ☐ |
| 4.11 | Remove a row | Row gone, totals update; undo restores | ☐ |
| 4.12 | Popovers on desktop / bottom sheet on mobile | Open, close on outside click and Esc, focus returns sensibly | ☐ |

## 5. Discounts and pricing math

Verify with a calculator on one known card (e.g. $10.00 base, NM).

| # | Steps | Expected | Status |
|---|---|---|---|
| 5.1 | Default global discount | 10% → unit price $9.00 | ☐ |
| 5.2 | Change global to 20% | Both sides update to $8.00 | ☐ |
| 5.3 | Set per-side override | Only that side changes; beats global | ☐ |
| 5.4 | Set per-card override | Beats side and global (most specific wins) | ☐ |
| 5.5 | Clear each override | Falls back to next level | ☐ |
| 5.6 | Discount 0% and 100% | 0% = full price; 100% = $0, no NaN or divide-by-zero | ☐ |
| 5.7 | Out-of-range discount (−5, 150, blank, "abc") | Rejected or clamped, never corrupts totals | ☐ |
| 5.8 | Display rounding | Totals round only at display; a 3-card sum matches sum of raw values, not sum of rounded lines | ☐ |

## 6. Fairness meter

| # | Steps | Expected | Status |
|---|---|---|---|
| 6.1 | Both sides empty | Neutral "add cards to compare", **not** "Fair" | ☐ |
| 6.2 | One side empty | Neutral state, copy names the missing side | ☐ |
| 6.3 | Equal totals | "Dead even" / "No difference"; diamond centered | ☐ |
| 6.4 | Gap ≤10% | Fair | ☐ |
| 6.5 | Gap 10–25% | Leaning; says who is favored | ☐ |
| 6.6 | Gap >25% | Lopsided | ☐ |
| 6.7 | Tolerance to 5% and to 30% | Zones shift live; Leaning cutoff = max(25, tol+15); no gap between bands | ☐ |
| 6.8 | Diamond extremes (1 cent vs $500) | Diamond clamped, never clips the track end | ☐ |
| 6.9 | Favored-side wording | Side receiving more value than it gives is the favored one; wording matches the totals | ☐ |
| 6.10 | Same discount on both sides | Meter does not move, but dollar totals do (expected per spec) | ☐ |
| 6.11 | Balance hint | "Add $X to …" is correct; adding that amount as cash makes it even | ☐ |
| 6.12 | Meter is understandable to a non-technical person | Ask a second person to read it cold (subjective, note their words) | ☐ |

## 7. Cash lines

| # | Steps | Expected | Status |
|---|---|---|---|
| 7.1 | Add cash to mine ("Cash to mine") and to theirs | Counts in side subtotal and meter | ☐ |
| 7.2 | Change discount | Cash unchanged (face value, never discounted) | ☐ |
| 7.3 | Side with **only** cash | Not treated as empty; meter gives a verdict | ☐ |
| 7.4 | Multiple cash lines, remove one | Totals update; undo works | ☐ |
| 7.5 | Zero / negative / non-numeric cash | Rejected or clamped | ☐ |
| 7.6 | Cash appears in Copy as text and share link | Yes | ☐ |

## 8. Control panel actions

| # | Steps | Expected | Status |
|---|---|---|---|
| 8.1 | Refresh prices with ~10 cards across both sides | Disabled + progress state while running; prices update; freshness reads "Updated just now" | ☐ |
| 8.2 | Refresh with >75 cards (batching) | Completes; all cards updated | ☐ |
| 8.3 | Refresh while offline | Prior prices kept, rows marked stale, no crash | ☐ |
| 8.4 | Freshness indicator over time | "Updated N min ago"; stale warning after threshold | ☐ |
| 8.5 | Per-card "updated hh:mm" tooltip | Present and plausible | ☐ |
| 8.6 | Missing-price warning → Jump to row | Scrolls to and highlights the row (also on mobile tab) | ☐ |
| 8.7 | Swap sides | Cards, cash, and side overrides swap; totals and meter flip | ☐ |
| 8.8 | Clear trade | Everything cleared, **no confirm dialog**, undo toast appears | ☐ |
| 8.9 | Undo via toast, ⌘Z; redo via ⇧⌘Z | One shared stack; toast undo and keyboard undo agree | ☐ |
| 8.10 | Undo after several different edits | Steps back in order; redo re-applies | ☐ |
| 8.11 | ⌘Z while typing in an input | Doesn't clobber native input undo unexpectedly (note behavior) | ☐ |
| 8.12 | Bulk condition: offer panel ⋯ → "Set condition for all cards" | NM–DMG buttons; applies to that side only; one undo step | ☐ |
| 8.13 | Bulk condition with manual-price rows | Manual price unaffected | ☐ |

## 9. Persistence

| # | Steps | Expected | Status |
|---|---|---|---|
| 9.1 | Build a trade, reload | Cards, cash, overrides, discount, tolerance all restored | ☐ |
| 9.2 | Close tab, reopen | Same | ☐ |
| 9.3 | Corrupt `fetchlist-trade` in localStorage by hand | App loads with an empty trade, no crash | ☐ |
| 9.4 | localStorage blocked (private window / storage disabled) | Page works for the session, no crash | ☐ |
| 9.5 | Two tabs open | Behavior is sane (last write wins, no error) — note observed | ☐ |
| 9.6 | Undo history after reload | Not required to persist; confirm no crash | ☐ |

## 10. Sharing

| # | Steps | Expected | Status |
|---|---|---|---|
| 10.1 | Share link on a typical 10–30 card trade | Link copied; format `<origin>/#trade=v1.…`; confirmation shown | ☐ |
| 10.2 | Paste link into a **new** tab/incognito | Opens read-only, banner "Shared trade — prices as of …", "Your side is on the left" hint | ☐ |
| 10.3 | Perspective flip | Opener's own cards on the left; creator's "mine" appears on the opener's right | ☐ |
| 10.4 | Totals/meter in shared view | Match the creator's view (same snapshot, discounts, cash) mirrored | ☐ |
| 10.5 | Read-only restrictions | No edit controls, no Refresh, no add buttons; Copy as text still works | ☐ |
| 10.6 | Read-only view persistence | Reload keeps hash → reopens; leaving the trade does not save it to localStorage | ☐ |
| 10.7 | Paste link into an already-open tab (hashchange) | Picked up without a manual reload | ☐ |
| 10.8 | Fork with **empty** local trade | Forks immediately into editable trade | ☐ |
| 10.9 | Fork with **non-empty** local trade | Confirm dialog: Cancel focused by default, destructive "Replace", "Copy mine as text" escape hatch | ☐ |
| 10.10 | Cancel / Esc on the dialog | Local trade untouched | ☐ |
| 10.11 | Replace, then ⌘Z | Original local trade restored | ☐ |
| 10.12 | After fork | `#trade=` removed from URL; reload does not reopen shared trade; prices still the snapshot until Refresh | ☐ |
| 10.13 | Leave shared view via breadcrumb / top-level tab | Hash dropped from URL | ☐ |
| 10.14 | Very large trade (~80+ cards) | Above 4,000 chars → share offers **Copy as text** instead of link | ☐ |
| 10.15 | Copy as text output | Readable in Discord/Notes: both sides, prices, totals, verdict; cash included | ☐ |
| 10.16 | Truncated / hand-edited link | Friendly broken-link state, no crash | ☐ |
| 10.17 | `#trade=v2.…` | "Reload to get the latest version" message (distinct from broken link) | ☐ |
| 10.18 | Link sent through iMessage / Slack / Discord | Survives intact (not truncated or mangled); preview harmless | ☐ |
| 10.19 | Link opened in Safari and Firefox | Decodes correctly (CompressionStream support) | ☐ |
| 10.20 | Special characters in names (Lim-Dûl, Æther, "Jötun") | Round-trip through link and text unchanged | ☐ |
| 10.21 | Image absent in shared view | Rows still render cleanly (images are not in the payload) | ☐ |

## 11. Guardrails and vision check

| # | Check | Expected | Status |
|---|---|---|---|
| 11.1 | After a full trade session **without** pressing Log this trade, inspect Collection | No quantities changed, no flags added | ☐ |
| 11.2 | Decks and Orders tabs | Untouched | ☐ |
| 11.3 | Anywhere in the UI | No display of total collection value | ☐ |
| 11.4 | Trade screen copy | Frames it as weighing a trade, not admiring holdings | ☐ |
| 11.5 | Network tab | Only Scryfall calls; nothing to our own backend | ☐ |

## 12. Accessibility and polish

| # | Steps | Expected | Status |
|---|---|---|---|
| 12.1 | Keyboard only: reach every control, open/close sheets and popovers | Logical tab order, visible focus, Esc closes overlays, focus returns | ☐ |
| 12.2 | Screen reader (VoiceOver) on meter and totals | Verdict and amounts announced, not just visual | ☐ |
| 12.3 | Meter does not rely on color alone | Text label for band present | ☐ |
| 12.4 | Reduced-motion setting | No jarring animation | ☐ |
| 12.5 | Touch targets on mobile | ≥44px on primary controls | ☐ |
| 12.6 | Console | No errors or React warnings in any flow above | ☐ |
| 12.7 | Toasts | Auto-dismiss, don't stack awkwardly, don't cover the verdict bar | ☐ |

## 13. Deploy compatibility (Cloudflare Workers)

| # | Steps | Expected | Status |
|---|---|---|---|
| 13.1 | `npm run build` | Clean | ☐ |
| 13.2 | `npm test` and `npm run test:coverage` | Pass | ☐ |
| 13.3 | Preview deploy (or `wrangler dev`): open a share link cold | Loads; hash is client-only so SPA fallback is unaffected | ☐ |
| 13.4 | Trade route deep link on preview | Loads, no 404 | ☐ |

## 14. Log this trade (the only Collection write path)

| # | Steps | Expected | Status |
|---|---|---|---|
| 14.1 | Build a trade, press Log this trade, then Cancel | Nothing changes: Collection, ledger and the trade are as before | ☐ |
| 14.2 | Confirm a trade of owned cards for new cards | Cards given leave Collection, cards received appear with set and collector number; entry shows under Trades & sales | ☐ |
| 14.3 | Log a card that a deck still uses | Sheet flags "N in decks" and says the deck checklist will show it as needed again; Log trade still works | ☐ |
| 14.4 | Log a card added from search that you do not own | Flagged "Not in your collection"; Collection is not reduced for the missing copies; toast says so | ☐ |
| 14.5 | Both sides empty | Log this trade disabled | ☐ |
| 14.6 | Open a share link | No Log this trade button until forked | ☐ |
| 14.7 | After logging | Calculator is empty, Undo cannot restore the trade, toast has View | ☐ |
| 14.8 | Delete a ledger entry | Confirm says Collection will not change back; Collection is untouched after | ☐ |
| 14.9 | Export a backup, wipe, import it (replace), then merge-import it twice | Ledger and Binder exclusions restored; merge adds no duplicates | ☐ |
| 14.10 | Import an older backup with no ledger | Imports normally; replace mode empties the ledger | ☐ |
| 14.11 | Demo mode | Two sample entries; logging a trade in demo never touches real data | ☐ |

## 15. Entry points and back control (Transactions)

The Calculator lives inside Transactions. Its first crumb names where it was opened from and returns there (ledger spec D1).

| # | Steps | Expected | Status |
|---|---|---|---|
| 15.1 | Collection → ⋯ → Trade calculator (the Collection deep link) | Calculator opens with **Transactions** active in the nav; crumb reads Collection › Trade | ☐ |
| 15.2 | Click "Collection" in that crumb | Back on the Collection tab, unchanged | ☐ |
| 15.3 | Binder → Add to new trade on a foil row | Card on My offer, quantity 1, that row's printing and finish, priced (or Set price if offline); crumb reads Binder | ☐ |
| 15.4 | Click "Binder" in that crumb | Back on Transactions › Binder | ☐ |
| 15.5 | Trades & sales → New trade, then click the first crumb | Crumb reads Trades & sales; returns to Transactions › Trades & sales | ☐ |
| 15.6 | Open a share link in a **new** tab | Lands on **Transactions** with the Calculator open, read-only; crumb reads Binder (not Collection) | ☐ |
| 15.7 | From the shared view, click "Binder" | Back on Transactions › Binder; `#trade=` gone from the URL; reload does not reopen the shared trade | ☐ |
| 15.8 | Paste a share link into an already-open tab sitting on Decks | Switches to Transactions with the Calculator open; crumb reads Binder | ☐ |

## Known / intentional (don't file as bugs)

- Swipe-down-to-dismiss on the mobile controls sheet is not built.
- Mockup 06 still shows bulk condition in the control panel; it's stale, real location is the offer panel ⋯ menu.
- "N in decks" counts by card **name** (decks carry no printing/finish).
- Copy-as-text can't be pasted back into a trade.
- Condition multipliers are fixed in v1.
- Same discount on both sides doesn't move the meter.
- Weighing a trade never writes to Collection. Only confirming **Log this trade** does (section 14).

## Sign-off

| Area | Tester | Date | Result |
|---|---|---|---|
| Desktop | | | |
| Mobile | | | |
| Sharing (cross-device) | | | |

Blocking defects: _none logged yet_
Ship decision: ☐ ship ☐ fix first
