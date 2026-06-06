# Collection Page — Design Brief

## Goal

Visual refresh of the Collection page to align with the Decks page aesthetic. Layout stays single-column — no sidebar split. The row language, header hierarchy, and empty state all need to match the app's current design direction.

---

## App context

- Dark-mode first, with light mode support. Uses CSS tokens for color/spacing.
- The Decks page has a collapsible sidebar rail + main content area with card rows that collapse to a single line with a `⋯` hover popover for actions.
- Collection page should feel like the same app — same row height rhythm, same type scale, same action patterns.

---

## What's on this page

Keep all of these; redesign their visual treatment only.

### 1. Header
Page title ("Collection"), stats strip (Total cards / In decks / Unique), import provenance line (source filename + relative date), and action buttons (+ Add card, Bulk edit, Replace CSV).

Currently cluttered — needs a clearer hierarchy:
- **Primary:** `+ Add card`
- **Secondary:** `Bulk edit`
- **Tertiary/utility:** `↺ Replace CSV`

### 2. Filter pills
All · In a deck · Free · Foils, each with a count badge. Horizontal pill row below the controls bar. Pattern is correct, just needs polish to match the decks page aesthetic.

### 3. Search + sort bar
Search input with an inline sort button that opens a small popover. Single row, sits above the filter pills.

### 4. Card list
Virtualized list of rows. Each row shows:
- Card name (left)
- Subtitle: printings count · foil count · deck allocation
- Total quantity `N×` (right)
- Left-edge colored stripe: rarity (common/uncommon/rare/mythic) or amber for "free" (not committed to any deck)

Rows expand in-place to show printing detail. The expanded state should feel intentional — not a raw data dump below the row.

### 5. Alpha rail
Thin vertical A–Z jump rail on the right edge. Only visible when sorted alphabetically and list is long enough. Keep as-is; just ensure it doesn't clash with the refreshed row chrome.

### 6. Empty state
Currently two plain paragraphs. Needs visual weight: an icon or illustration area, a headline, a short description, and a clear primary CTA button ("Upload CSV" or "+ Add card").

### 7. Undo toast
Bottom-center floating toast with message + Undo button + auto-dismiss progress bar. Keep the pattern.

---

## What NOT to change

- Single column layout — no sidebar split
- Filter pill segmentation (All / In a deck / Free / Foils)
- Virtualized list (redesign row chrome only)
- Alpha rail position (right edge)

---

## Design goals

- Header action hierarchy should be obvious at a glance
- Row visual language should match or closely complement the Decks page card rows
- Empty state should feel designed, not an afterthought
- The "free" / "unassigned" concept (cards not in any deck) should be legible — the amber stripe and badge are the right signals, just polish them

---

## Deliverables

- Full-page mockup at desktop width (~1200px) — **primary frame: populated list state**
- Full-page mockup at mobile width (~390px)
- Secondary frame: empty state (no collection loaded)
