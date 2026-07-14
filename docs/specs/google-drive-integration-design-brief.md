# Google Drive Integration (Tier 2) — Design Brief

## Goal

Add a "Connect Google Drive" option alongside the existing local-file backup flow (Tier 1, already shipped) so users can save/load their Fetchlist profile to a single hidden file in their own Google Drive. No accounts on our side — auth is entirely client-side OAuth against the user's Google account.

Tracks issue #52, Tier 2.

---

## App context

- Dark-mode first, with light mode support. Uses CSS tokens for color/spacing.
- This feature lives in the same area as the existing backup/restore UI: `ProfileExportImport` component, rendered in the deck sidebar footer (desktop) and in the mobile deck-picker sheet footer (separate, duplicated markup — see below).
- Desktop sidebar is **240px wide** (52px when collapsed to a rail — this feature's UI does not need to render in collapsed mode, same as the existing Export/Import buttons).
- Existing pattern in this area (Tier 1, just shipped): a small "📎 linked: filename — change" chip appears above the Export/Import button row once a local file is linked. Whatever Drive-connected state we design should feel like a sibling of this pattern, not a competing one — e.g. "🔗 Google Drive: user@email.com — disconnect" would sit in the same visual slot.
- Toast system already exists (top-right on desktop, full-width strip on mobile) for success/warn/neutral messages — reuse it for save/load confirmations rather than inventing new inline messaging where possible.
- No paid backend — see cost constraint below. This shapes the error-state design: token expiry will happen periodically (no refresh-token server), so "reconnect" needs to read as a normal, low-friction step, not an alarming failure.

---

## Cost constraint

This app has no revenue stream and the goal is to stay free/ad-free. We're deliberately **not** building the optional Cloudflare Worker for refresh-token storage (issue #52 lists this as optional, +1 day). Practical consequence for design: OAuth tokens expire after ~1hr, so users will periodically need to re-click "Connect" to resume. Design the disconnected/expired state so this feels like a normal "reconnect" affordance, not an error state — same button, doesn't need scary red treatment.

---

## States to design

### 1. Not connected
Entry point button, e.g. "Connect Google Drive". Lives in the sidebar footer area alongside (not replacing) the existing local Export/Import buttons — this is an additional storage option, not a replacement for Tier 1.

### 2. Connecting
Brief transitional state while the OAuth popup/redirect is in flight. Likely just a spinner on the button — confirm treatment.

### 3. Connected (idle)
Shows the linked Google account (avatar and/or email), plus "Save to Drive", "Load from Drive", and "Disconnect" actions. Needs to fit the 240px sidebar width without wrapping awkwardly — email addresses can be long, so truncation with a title/tooltip is expected.

### 4. Saving / Loading
Spinner state on the relevant button (Save or Load) while the Drive API request is in flight. Rest of the UI stays interactive.

### 5. Error states
- Token expired — should read as "reconnect", not "something broke" (see cost constraint above)
- No network
- Drive quota exceeded (rare, but Google API can return this)
Design a single flexible error treatment that can carry a short message for any of the above, rather than three bespoke layouts.

### 6. Conflict on load
Shown when the Drive backup and local data disagree on recency: "Drive backup is from [date], local data is from [date] — which do you want to keep?" This needs to be a deliberate, unhurried moment — data loss risk on the wrong choice — probably a small modal/sheet rather than an inline panel, given the sidebar's width constraints.

---

## What NOT to change

- The existing Tier 1 local-file linking UI (chip + Export/Import buttons) — Drive is additive, sits alongside it
- The toast system's visual language
- Sidebar width/collapse behavior

## Out of scope for this brief

- Auto-sync / real-time sync (Tier 3 — explicitly deferred, see issue #52)
- Partial export (single deck)
- Any UI for the optional refresh-token Worker (not being built)

---

## Design goals

- Drive-connected state should feel like a natural sibling to the Tier 1 "linked file" chip, not a visually competing pattern
- Reconnect-after-expiry should feel routine, low-stakes — this will happen regularly given the no-refresh-token-server constraint
- The conflict-resolution moment should feel appropriately weighty (risk of data loss) without being scary
- Everything needs to work at 240px sidebar width without horizontal scrolling or awkward truncation

---

## Deliverables

- Sidebar footer area at desktop width (240px), covering: not-connected, connected-idle, and saving/loading states
- Conflict-resolution modal/sheet, desktop width (~1200px viewport, modal itself likely narrower)
- Mobile treatment (~390px) — note: mobile currently has its own duplicated Export/Import buttons in the deck-picker sheet footer (not the shared `ProfileExportImport` component), so the mobile frame should show how Drive connect/status fits into that sheet footer specifically
- Error-state treatment (single flexible frame, shown with a sample message)
