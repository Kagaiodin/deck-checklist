# Cost-to-complete — Design Brief

Issue: #107 · Spec: `docs/specs/cost-to-complete-spec.md` · Target: existing progress strip on the deck checklist view

## Ask
Design how a deck's **remaining cost** appears in the deck progress strip, and compare it against the three rough options below. Return 2–3 polished variants so one can be chosen.

## What the app is
Fetchlist is a sleeving/acquisition checklist for Magic: The Gathering decks. You import a deck list, track what you're gathering or ordering, and mark the deck built. The deck view is the main screen. It works on mobile and desktop, in dark and light mode, with several accent colors.

## The feature
Show a live dollar total for the cards still missing from the deck, for example "41 / 74 fetched, ~$86 to finish". It updates as cards are tagged or untagged. The user's question is "how much is left to spend?", so they don't have to leave the app to check TCGPlayer.

## Where it goes
The existing progress strip at the top of the checklist. Today it shows:
- a large count ("41 / 74 fetched") and a percent
- a gradient progress bar
- a row of source-tag chips (Owned, Ordered, Need to buy, and so on) that double as filters

Design within this strip. Don't add a new page or a separate panel.

## Data available to display
- **Remaining cost**: sum of unit price × quantity for cards that are missing. "Missing" means tagged Need to buy or untagged.
- **Total deck cost** and **percent paid off by cost**. This is optional and exists to show that "two cheap cards left" and "two fetchlands left" are very different situations.
- **Unpriced count**: cards with no price, counted as $0. The total must say so, for example "+2 unpriced".
- **Ordered note**: cards already ordered are excluded from "to finish" but can appear as a muted "3 ordered".
- **Freshness**: "Prices as of 9:12am". Show a stale state if a refresh failed (offline).
- **Empty state**: an existing deck before prices have loaded. Show nothing or a quiet "Loading prices…". Never show a misleading $0.

## Rough options to compare against
1. **A, inline text**: one extra line under the existing bar. Smallest change.
2. **B, two bars**: a count bar plus a cost bar. The only option that shows count vs. cost.
3. **C, header stat**: total beside the percent, with detail behind a tap.

Reference mockup: the file `cost-to-complete-mockups.html` in this session's scratchpad (colors are approximate).

## Constraints
- **Vision check:** this prices the acquisition gap only. **Never show a total for owned cards, and never show collection value.** No "you own $X" anywhere.
- Minimally invasive: the user is wary of accumulating UX debt. Favor a small footprint and reuse the strip's existing styles and tokens (`src/tokens.css`).
- Must work at 390px wide without horizontal scroll, in light and dark mode, and with all accent variants.
- Don't rely on color alone. The cost bar needs a text label.
- The number is an estimate from Scryfall's default printing, in USD. Copy should say "~" or "est.", not imply an exact quote.
- No ads, no promotional styling, no vendor logos.

## States to show for each variant
1. Mid-build (41/74, $86 left, 2 unpriced, 3 ordered)
2. Nearly done (72/74, $4 left)
3. Complete (cost line gone or replaced by a done state)
4. Prices loading or unavailable (existing deck, first open)
5. Stale prices (offline, last updated yesterday)
6. Mobile, 390px

## Deliverable
2–3 variants as local HTML artifacts covering the states above, plus a one-line note on the trade-off of each. Flag anything that needs a new token.
