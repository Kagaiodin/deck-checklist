# Orders Texture Pass — Technical Design Spec

**Feature:** Typography + status-color alignment of the Orders page with Decks/Collection
**Status:** Ready for implementation
**Design source:** Open Design project `5c6d105f-c086-441b-ad55-2e3403c89799`
  — `orders-texture-mockup.html` (primary — before/after list + expanded card, "where mono lives" table)
  — `design-review-2026-07-13.html` (context — full review this pass came out of)
**Related:** cohesion triage 2026-06-11 (Orders' ledger *structure* is intentional and out of scope here)

---

## Problem Statement

Orders reads like a different app from Decks/Collection. The June triage correctly protected
its structural divergence (bordered expandable cards, inline search, header shape) — but the
page also inverted the app's typographic ratio without that ever being a decision. On Decks and
Collection, mono is a spice (quantities, prices, machine metadata, ~10% of text). On Orders,
`--ocard-mono` is applied at ~20 call sites in `OrdersPage.css` and carries *prose*: "Ordered
May 21", "3 cards", "no tracking", the whole list-meta line. Second issue: an overdue order
fires four red signals at once (left bar, red duration text, LATE pill, red meta segment).

Two moves fix it. **No layout, spacing, or DOM-structure changes** beyond the items listed.

1. **Mono demotion** — prose returns to the body face; mono keeps only data atoms
   (prices, counts' digits, tracking IDs, timeline gutter dates, eyebrow labels).
2. **One red per level** — page level: red on the overdue count only; card level: left
   bar + the "N days overdue" text; the LATE pill is removed (it repeats the word beside it).

---

## 1. Type-role rules (target state)

| String | Face | Notes |
|---|---|---|
| Prices, subtotals (`$56.49`) | mono, tabular | unchanged |
| Counts inline ("3 cards", "11 in flight") | mono **digit**, body word | wrap digits in `.num` |
| Tracking IDs, carrier chips (`USPS ···9900`) | mono | unchanged |
| Timeline gutter dates (`.tl-when`) | mono | unchanged — dates-as-data in a data column |
| Eyebrow labels (`TRACKING ·`, `.ocard-mob-cta-k`) | mono uppercase, ≥0.06em tracking | unchanged — app-wide eyebrow convention |
| "Ordered May 21", "Expected May 31", "no tracking" | **body 13px/400–500, muted/dim** | demoted |
| List-meta line ("3 orders · 11 cards in flight") | **body 13px/500 muted**, mono digits | demoted |
| "N days overdue" | **body 13px/550 `--danger`**, mono digits | the card's single red text |
| Status pills (`Received`, `Arrives tomorrow`) | mono uppercase pill | unchanged (badge convention); `Late` variant removed |

Utility class (add once, `OrdersPage.css`):

```css
.num {
  font-family: var(--ocard-mono);
  font-variant-numeric: tabular-nums;
}
```

---

## 2. `OrdersPage.css` — selector-by-selector

Demotion = remove `var(--ocard-mono)` from the `font:` shorthand so the app body face is
inherited; sizes below are the target. Colors unchanged unless noted.

| Selector (approx. line) | Current | Change to |
|---|---|---|
| `.orders-listmeta` (~127) | `font: 12px/1 var(--ocard-mono)` | `font-size: 13px; font-weight: 500; line-height: 1.4` |
| `.orders-overdue-meta` (~134) | `font: 12px/1 var(--ocard-mono)` | `font-size: 13px; font-weight: 550; line-height: 1.4` — keeps `--danger` |
| `.ocard-vendor-sub` (~213) | `font: 11.5px/1 var(--ocard-mono); letter-spacing: 0.02em` | `font-size: 13px; line-height: 1` — drop letter-spacing |
| `.ocard-cards-cell` (~218) | `font: 12.5px/1 var(--ocard-mono)` | `font-size: 13px; line-height: 1` — digit gets `.num` in TSX |
| `.ocard-eta-exp` (~275) | `font: 11.5px/1 var(--ocard-mono)` | `font-size: 12.5px; line-height: 1.3` |
| `.ocard-tracking-empty` (~305) | `font: 11.5px/1 var(--ocard-mono)` | `font-size: 12.5px; line-height: 1.3` |
| `.tl-sub` (~431) | `font: 11px/1.3 var(--ocard-mono)` | split — see §3.4 (`.tl-sub` → body 12px; new `.tl-sub.mono` keeps current mono for tracking numbers) |
| `.li-subtotal` (~500) | `font: 11.5px/1 var(--ocard-mono)` on the whole row | label word → body 13px/500; wrap the value in a span keeping mono + tabular (`.li-subtotal-v` gains the mono family) |
| `.orders-spend-meta` (~506) | inherits mono from `.orders-listmeta` | add `font-family: var(--ocard-mono)` so `$X.XX tracked` keeps mono after the parent demotes |
| `.ocard-mob-sub` (~576) | `font: 12px/1 var(--ocard-mono)` | `font-size: 13px; line-height: 1.2` |
| `.ocard-mob-status-pill` (~581) | `font: 12px/1 var(--ocard-mono)` | `font-size: 12.5px; font-weight: 500; line-height: 1` — tinted bg unchanged |
| `.ocard-mob-cta-v` (~599) | `font: 13px/1 var(--ocard-mono)` | `font-size: 13px; font-weight: 500; line-height: 1` |

**Do not touch** (data atoms / conventions): `.orders-count`, `.orders-chip .n`, `.ocard-tracking`
(+ `.carrier`), `.tl-when`, `.li-qty`, `.li-price`, `.ocard-pill` base style, `.ocard-mob-cta-k`,
`--ocard-mono` definition itself.

---

## 3. `OrdersPage.tsx` — render changes

### 3.1 List-meta digits (~line 830–837)

Wrap numeric tokens in `.num` so digits stay tabular inside the now-body meta line:

```tsx
<span className="orders-overdue-meta">
  ⚠ <span className="num">{overdueCount}</span> order{overdueCount !== 1 ? "s" : ""} overdue
</span>
...
<span className="num">{cardsInFlight}</span> cards in flight
```

Same for the order count and `activeSpend` (spend value is already isolated in
`.orders-spend-meta`, which keeps mono via §2 — no `.num` needed there).

### 3.2 Remove the redundant LATE pill (~line 383)

```tsx
// remove:
{isLate && <span className="ocard-pill late">Late</span>}
```

`eta.label` ("N days overdue", `.ocard-eta-when.late`, red 600) plus the red left bar
(`.ocard.state-late::before`) now carry the overdue signal on the card. Keep the `warn`
("Arrives tomorrow"), `ok` ("Received"), and `muted` ("Cancelled") pills — they are the only
carrier of their message. Keep `.ocard-pill.late` CSS for the mobile detail sheet if shared;
delete if this was its only use.

### 3.3 Dedupe the eta line (~lines 382–388)

Shipped state renders "Jun 25 · Expected Jun 25" (label + `.ocard-eta-exp` repeat the same
date). When the order is not late and `eta.label` resolves to the expected-arrival date,
render a single `Arrives {date}` in `.ocard-eta-when` and skip `.ocard-eta-exp`. Keep
`.ocard-eta-exp` ("· Expected {date}") only when it adds information — i.e. the late case,
where the label is a duration, and wrap its digits in `.num`
(`<span className="num">375</span> days overdue`).

### 3.4 Timeline sub-lines

`.tl-sub` currently carries three kinds of content in mono: vendor name ("TCGPlayer"), raw
tracking number, and "N days late". Add `mono` as a modifier class applied only to the
tracking-number instance:

```tsx
<span className="tl-sub mono">USPS 9400111899223397719900</span>  // stays mono
<span className="tl-sub">TCGPlayer</span>                          // body
<span className="tl-sub late"><span className="num">375</span> days late</span> // body, --danger
```

`.tl-sub.late { color: var(--danger); font-weight: 550; }` (color moves here if it currently
sits on the base class).

### 3.5 Tracking-empty copy (~line 423)

`— no tracking` → `No tracking`. The em-dash prefix was terminal-voice; the body face doesn't
need it.

---

## 4. Red budget (verify, don't build)

After §3.2, confirm per state:

- **Page (active filter, overdue present):** red appears once — `.orders-overdue-meta`.
- **Overdue card, collapsed:** red twice, same signal — left bar + `.ocard-eta-when.late`.
- **Overdue card, expanded:** adds `.tl-dot.late` + `.tl-sub.late` in the timeline only.
- `--danger` (`#e05353`) everywhere above; never `--src-buy-fg` (`#f87171`) — that red belongs
  to the "Need to buy" source tag.

---

## 5. Out of scope (protected by the 2026-06-11 triage)

- Card structure: bordered expandable cards, left status bar, hover-reveal actions.
- Header shape, inline search, mobile "+ New order" placement.
- Segmented filter chips, linked-deck chips (separate P2), NewOrderSheet (only if it
  reuses a changed class — verify, don't restyle).

---

## 6. Acceptance criteria

- [ ] No `var(--ocard-mono)` on prose selectors listed in §2; data-atom selectors unchanged.
- [ ] List meta reads in the body face with tabular digits; `$X.XX tracked` still mono + accent.
- [ ] No LATE pill on order cards; warn/ok/muted pills still render.
- [ ] Non-late cards show one date ("Arrives Jun 25"), not the doubled form.
- [ ] "No tracking" without em-dash.
- [ ] Timeline: dates mono, tracking number mono, vendor + late-note body face.
- [ ] Red budget per §4 holds in dark **and light** mode (light `--danger` override applies).
- [ ] Mobile detail sheet: `.ocard-mob-sub` / status pill / CTA value in body face; eyebrow kept mono.
- [ ] `OrdersPage.test.tsx` updated for changed strings (em-dash removal, pill removal,
      eta dedupe) — check for assertions on `Late`, `— no tracking`, `Expected`.
- [ ] Visual check against `orders-texture-mockup.html` proposed panels at 1440 and 390.

---

## 7. Suggested commit split

1. `.num` utility + §2 CSS demotions (pure CSS, no behavior).
2. §3 TSX changes + test updates.
3. Screenshot re-capture of Orders states (`npm run screenshots`) for the design-review set.

---

## 8. Addendum (2026-07-16) — remove the late-card gradient wash

**Context:** post-implementation validation of the re-captured screenshots
(`46-desktop-orders-light-mode.png`). In light mode the overdue card renders a translucent
red wash over the white surface — a "red glass" effect that fights the app's flat,
border-led surface language. User confirmed removal.

**Why it's the right call, not just taste:**
- `state-late` is the **only** card state with a background gradient — `state-warn` and
  `state-ok` are flat surfaces with a colored left bar. This makes late consistent with
  its siblings.
- The rgba values are hardcoded dark-mode `--danger` (`rgba(224, 83, 83, …)`), so the wash
  doesn't adapt to the light theme — it's painted over white instead of `#151829`.
- Brand posture: borders carry structure; surfaces stay flat (shadows only on overlays).
- Red budget (§4): bar + border + text already say "late" three ways; the wash was a fourth.

**Change (`OrdersPage.css`):**

```css
/* ~179 — remove the gradient, keep the tinted border */
.ocard.state-late {
  border-color: rgba(224, 83, 83, 0.3);
  /* background: linear-gradient(...) — DELETE; inherit flat card bg */
}

/* ~197 — hover: same removal; inherit the standard card hover bg */
.ocard.state-late:hover {
  border-color: rgba(224, 83, 83, 0.4);
  /* background: linear-gradient(...) — DELETE */
}
```

If the tinted borders also read too warm in light mode after the wash is gone, switch them
to `color-mix(in srgb, var(--danger) 30%, transparent)` so they follow the theme's darkened
`--danger` — judgement call at implementation time, verify at both themes.

**Acceptance:**
- [ ] Late cards are flat in dark and light; only bar + border + text differ from a normal card.
- [ ] Hover on a late card matches the standard card hover surface (border stays tinted).
- [ ] Re-capture `05`, `42`, `46` and eyeball light mode specifically.
