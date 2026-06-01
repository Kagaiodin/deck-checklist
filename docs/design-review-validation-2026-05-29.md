# Fetchlist — Design Review Validation Report
**Date:** May 29, 2026
**Reviewer:** Claude (Playwright + design-seed.json fixture)
**Source review:** `design-review-holistic-2026-05-28.html` (Open Design project `a0b6c12b-7f1f-4082-aebb-898fa0599033`)
**Production URL:** https://fetchlist.kagaiodin.dev
**Method:** Playwright Chromium at 1440px (desktop) and 390px (mobile), seeded with `scripts/fixtures/design-seed.json`

---

## Executive Summary

Most P1 findings from the May 28 review have already been addressed by PRs merged in the 24 hours following the review. Three genuine open items remain actionable without designer input: the **LATE badge color** (one CSS change), the **import modal missing helper text**, and the **Orders H2 near-invisible contrast in dark mode** (new finding, not in original review).

---

## Open Items (unaddressed)

### High priority

| # | Finding | Priority | Notes |
|---|---|---|---|
| 1 | **LATE badge is amber, not danger red** | P2 | Badge color doesn't match severity of overdue text. One CSS change: `background: rgba(224,83,83,.18); color: #e05353; border: 1px solid rgba(224,83,83,.3)` on the `.order-status-late` / LATE badge class. |
| 2 | **Import modal: disabled "Import & Validate" with no explanation** | P1 | Submit button is `disabled` when textarea is empty; no helper text, hint, or tooltip explains why. Add helper text below textarea: "Paste a decklist to enable import." |
| 3 | **Orders H2 "Orders" near-invisible in dark mode** *(new — not in original review)* | P1 | Computed color `rgb(8,6,13)` (near-black) on dark background `rgb(13,15,26)`. Heading is faintly visible but fails contrast. Likely used an absolute color value instead of a theme-aware token. Check `--text` token resolution in dark mode for this element. |

### Lower priority / needs designer decision

| # | Finding | Priority | Notes |
|---|---|---|---|
| 4 | **Deck picker sheet title says "My Decks"** *(new)* | P2 | Nav button says "Decks"; sheet title says "My Decks". Inconsistency survived the nav label fix. |
| 5 | **Mobile Orders: 3 action buttons at 390px** | P2 | Mark received + Cancel order + Details all visible but tight. Review recommended collapsing Cancel + Details into overflow (⋯). |
| 6 | **Mobile deck picker: no "+ Create blank deck" path** | P1 (UX debt) | Sheet shows only "+ Import Deck". Main empty state has "or create a blank deck" text link but picker sheet doesn't. |
| 7 | **Cancel affordance: 3 different dismiss patterns** | P1 | Onboarding modal ✕ vs. import panel ✕ Cancel vs. sidebar + New → ✕. Not manually verified in this pass — needs side-by-side comparison. |
| 8 | **Theme settings discoverability** *(new)* | P2 | Theme controls are 2 clicks deep (⋮ → palette icon popover). No header indicator of current mode. |
| 9 | **Collection "Free" label ambiguous / counts don't sum** | P2 | "In a deck" + "Free" counts overlap (a card with 2 copies, 1 in deck + 1 free, appears in both). "Free" should be renamed "Not in a deck" or "Unassigned." |

---

## Already Fixed (confirmed by Playwright or PR history)

| Finding | Status | Fixed by |
|---|---|---|
| P0: Issue #70 — Escape fully dismisses buy flow | ✅ Fixed | PR #72 |
| P1: Nav labels "My Decks" / "My Collection" on desktop | ✅ Fixed | (natural state post-rename) |
| P1: Order vendor names centered | ✅ Fixed | PR #59 (CSS restore after merge conflict) |
| P1: Mobile button height inconsistency (52–56px bloat) | ✅ Fixed | Side-effect of PR #61 / PR #65 |
| P1: Mobile Decks redundant chrome (3 sections before content) | ✅ Improved | PR #73 |
| P1: Collection heading padding (bleeds to edge on mobile) | ✅ Fixed | 16px gutter confirmed |
| P1: Empty state "Import Deck" CTA ghost/outline | ✅ Fixed | PR #73 (filled/primary + single clear CTA) |
| P1: Light mode "Orders" H1 invisible | ✅ Fixed | PR #58 (full token coverage for light mode) |
| P2: Asterisk/color dots directly in header (dev-facing) | ✅ Redesigned | PR #62 (moved to ⋮ → palette popover) |
| UX debt: Onboarding "Skip for now" returns each session | ✅ Fixed | PR #56 (dismissal persists via localStorage) |

---

## Could Not Verify (requires specific state)

| Finding | Why |
|---|---|
| P0: Deck name + % concatenation in mobile picker | Needs a deck with a name long enough to truncate at 390px. Fixture deck names are short and lay out correctly. |
| P1: Cancel affordance consistency across 3 modal surfaces | Needs simultaneous access to onboarding modal, import panel, and buy list sheet for side-by-side comparison. |
| P1: Mobile Orders tight action row (live data) | Fixture order renders at 390px — all 3 buttons fit, snug but not broken. Confirm acceptable or implement overflow. |
| P2: Received/Cancelled tab count styling | No Received/Cancelled orders in fixture beyond the seed's 1 received order. |
| UX debt: Buy flow → order success state (toast/animation) | Requires exercising the full buy flow through vendor picker send. |
| UX debt: Buy flow → order create form at 390px | Requires keyboard-up state in order create form. |

---

## New Findings (not in original review)

1. **Orders H2 dark mode contrast** — `rgb(8,6,13)` text on `rgb(13,15,26)` background. Faintly readable but likely fails WCAG AA. The light mode fix appears to have used an absolute value instead of `--text` token.
2. **Deck picker sheet title "My Decks"** — inconsistent with nav label "Decks". Single string change in the sheet header.
3. **Theme settings discoverability** — ⋮ → palette icon is not intuitive for finding Dark/Light mode. No persistent indicator in the header shows current mode. Designer decision on whether this needs a visible affordance.

---

## Validation Method Notes

- Playwright Chromium (from project `node_modules`)
- Data seeded via `ctx.addInitScript` using `scripts/fixtures/design-seed.json` (3 decks, 1 active TCGPlayer order, 1 received Card Kingdom order, 13-card collection)
- Screenshots saved to `/tmp/fl2-*` and `/tmp/fl3-*` during the session (ephemeral — not committed)
- Theme switching verified by: ⋮ → `.settings-btn` → `.mode-segment-btn:has-text("Light")` → navigate to Orders
- The live production account (kagaiodin@gmail.com) has no real data; all meaningful findings required the fixture
