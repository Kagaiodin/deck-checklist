# Fetchlist screenshot audit — 2026-06-09

## Background

`npm run screenshots` uses Playwright to automate the app and save viewport captures to `design-review-screenshots/`. The script runs against a fixed seed dataset (or your real browser data) so shots are reproducible. Three viewport sizes are covered: **Desktop 1440×900**, **Mobile 390×844**, **Tablet 768×1024**.

The Orders page just finished a full v2 redesign (Phases 1–5). Several screenshot targets are now broken (stale selectors pointing at removed UI) and the new orders flows have never been captured.

---

## Current screenshot inventory

### Desktop 1440×900

| File | What it shows | Status |
|------|---------------|--------|
| `00-desktop-onboarding.png` | Onboarding modal on first load | ✅ Good |
| `01-desktop-decks-empty.png` | Decks tab, no deck selected | ✅ Good |
| `02-desktop-decks-selected.png` | Deck selected, full card checklist | ✅ Good |
| `03-desktop-decks-missing-only.png` | "Missing only" filter active | ✅ Good |
| `04-desktop-collection.png` | Collection tab, cards loaded | ✅ Good |
| `05-desktop-orders.png` | Orders tab, Active filter | ✅ Good |
| `06-desktop-buy-list-open.png` | Buy list sheet open | ✅ Good |
| `07-desktop-theme-light.png` | Light mode, Decks tab | ✅ Good (but shows Decks, not Orders — see gaps) |
| `08-desktop-import-modal.png` | Import deck panel open | ✅ Good |
| `17-desktop-order-create-form.png` | New order form | ⚠️ Stale — shows old single-field form; new flow is a multi-step sheet |
| `18-desktop-orders-received.png` | Orders Received tab | ⚠️ Stale — selector targets removed tab component |
| `19-desktop-collection-import-confirm.png` | Collection CSV replace confirmation banner | ✅ Good |
| `20-desktop-buy-flow-vendor.png` | Buy flow vendor picker step | ✅ Good |
| `22-desktop-source-picker.png` | Source tag picker open on a card row | ✅ Good |
| `23-desktop-bulk-tag.png` | Bulk tag mode | ✅ Good |
| `24-desktop-edit-mode.png` | Deck edit mode (rename/delete cards) | ✅ Good |
| `25-desktop-order-details.png` | Order expanded (inline accordion) | ⚠️ Stale — selector targets a removed "Details" button |
| `26-desktop-order-form-card-search.png` | New order form, card search active | ⚠️ Stale — uses removed combobox selectors |
| `26b-desktop-order-form-card-added.png` | New order form, card added to list | ⚠️ Stale — same |
| `27-desktop-collection-empty.png` | Collection tab with no data | ✅ Good |
| `28-desktop-deck-rename.png` | Deck rename inline form | ✅ Good |
| `29-desktop-deck-format-edit.png` | Format edit inline form | ✅ Good |
| `30-desktop-export-dropdown.png` | Export dropdown menu | ✅ Good |
| `31-desktop-undo-toast.png` | Undo toast after clearing collection | ✅ Good |
| `32-desktop-overflow-menu.png` | Header "···" overflow menu | ✅ Good |
| `33-desktop-collection-bulk-edit.png` | Collection bulk edit panel | ✅ Good |
| `34-desktop-profile-import.png` | Profile import/export panel | ✅ Good |
| `35-desktop-sidebar-rail.png` | Sidebar collapsed to icon rail | ✅ Good |
| `36-desktop-extra-info.png` | Extra info section expanded (tokens, alt printings) | ✅ Good |

### Mobile 390×844

| File | What it shows | Status |
|------|---------------|--------|
| `09-mobile-decks.png` | Decks tab | ✅ Good |
| `10-mobile-deck-selected.png` | Deck selected, card list | ✅ Good |
| `11-mobile-collection.png` | Collection tab | ✅ Good |
| `12-mobile-orders.png` | Orders list (active) | ✅ Good |
| `13-mobile-nav.png` | Bottom nav bar | ✅ Good |
| `14-mobile-buy-list.png` | Buy list sheet | ✅ Good |
| `21-mobile-deck-picker.png` | Deck picker sheet | ✅ Good |

### Tablet 768×1024

| File | What it shows | Status |
|------|---------------|--------|
| `15-tablet-decks.png` | Decks tab | ✅ Good |
| `16-tablet-collection.png` | Collection tab | ✅ Good |

---

## Stale shots that need to be re-captured

These files exist but show old UI that no longer exists in the app.

| Shot | What it currently shows | What it should show |
|------|-------------------------|---------------------|
| `17-desktop-order-create-form.png` | Old single-field new order form | Step 1 of the new multi-step sheet (vendor selection with radio rows) |
| `18-desktop-orders-received.png` | Probably a blank or error state | Orders tab with Received chip active, received order cards |
| `25-desktop-order-details.png` | Stale expanded state | Order card expanded with inline accordion (timeline left, line items right) |
| `26-desktop-order-form-card-search.png` | Stale combobox UI | Step 2 of new sheet with card search results dropdown |
| `26b-desktop-order-form-card-added.png` | Stale form | Step 2 with cards added and qty/price inputs visible |

---

## Missing shots — never captured

These are new UI states from the orders redesign that have no screenshot yet.

### Desktop

| Suggested filename | What it should show |
|-------------------|---------------------|
| `37-desktop-orders-new-sheet-step1.png` | NewOrderSheet open at Step 1 — vendor list with radio rows, "Other vendor" escape hatch |
| `38-desktop-orders-new-sheet-step2.png` | NewOrderSheet Step 2 — Add manually tab, card search active |
| `39-desktop-orders-new-sheet-step2-filled.png` | Step 2 with cards added, qty + price inputs filled, running total shown |
| `40-desktop-orders-new-sheet-step3.png` | Step 3 — Order details fields (order #, date, tracking, expected arrival) |
| `41-desktop-orders-new-sheet-done.png` | Step 4 — Success state with green checkmark and order summary card |
| `42-desktop-orders-expanded-active.png` | OCard expanded — active order with timeline (left) and line items + price subtotal (right) |
| `43-desktop-orders-expanded-received.png` | OCard expanded — received order with "X of X cards" summary row and Show cards toggle |
| `44-desktop-orders-cancelled.png` | Orders tab, Cancelled filter — muted/strikethrough rows |
| `45-desktop-orders-edit-sheet.png` | Edit order sheet open — pre-filled Step 3 with "Save changes" and "Delete" in footer |
| `46-desktop-orders-light-mode.png` | Orders tab in light mode — warm paper background, status stripe colors |
| `47-desktop-orders-overdue-meta.png` | Orders tab with ⚠ overdue banner between chips and list |
| `48-desktop-orders-spend-meta.png` | Orders page meta showing "$X.XX tracked" when priced orders exist |

### Mobile

| Suggested filename | What it should show |
|-------------------|---------------------|
| `49-mobile-orders-detail-sheet.png` | Full-screen order detail sheet (tap a row on mobile) — shows status pill, tracking CTA, timeline, cards |
| `50-mobile-orders-new-sheet.png` | NewOrderSheet as a bottom sheet (slides up from bottom on mobile) |

### Tablet

Currently no orders tab is captured at tablet size. Worth adding if the tablet layout differs meaningfully from desktop (it likely collapses the panel to single-column at 768px).

| Suggested filename | What it should show |
|-------------------|---------------------|
| `51-tablet-orders.png` | Orders tab at 768px |

---

## Questions for Open Design

1. **Light mode orders** — shot `07` already captures light mode but stays on the Decks tab. Should there be a dedicated light-mode orders shot, or is the existing Decks shot sufficient for theme validation?

2. **Orders empty state** — the redesign added a styled empty card (box icon, "No orders yet", two CTAs). Should this be captured? Currently only the populated state is shown.

3. **Tablet layout** — at 768px wide, the Orders page likely renders differently than at 1440px (no side-by-side panel expansion). Worth a separate shot or out of scope?

4. **Stale shots** — shots 17, 18, 25, 26, 26b show removed UI. Should these be re-shot with new selectors, or is a full audit of the orders section preferred first?
