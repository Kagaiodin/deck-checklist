# Demo Mode — Design Brief

Spec: `docs/specs/demo-mode-spec.md`. Issue: #98.

## Goal

Make it obvious, at all times, that the viewer is looking at sample data, and make leaving effortless. Otherwise add as little UI as possible (UX-debt concern: favor minimally invasive placements).

## Surfaces

1. **Demo banner**: persistent strip, top of the viewport, all breakpoints. Content: `Demo mode · [Exit]`. Must be unobtrusive but never missable; it must not be dismissible.
2. **Settings entry**: a "Load sample data" row at the bottom of the Settings popover, low visual weight.
3. **Replace-data confirmation**: dialog shown only when real data exists, for both the Settings entry and the link. Copy: "Replace your data with sample data? Your data is saved and comes back when you exit." Actions: Cancel / Load sample data.
4. **Disabled backup controls**: Drive save/load and export/import shown disabled with the hint "Exit demo mode to back up your data".
5. **Link arrival** (`?demo=true`, fresh user): no extra screen. The banner is the only signal. Onboarding is suppressed.

## Constraints

- Tokens only, from `src/tokens.css`. No new custom properties unless unavoidable.
- Dark (default) and light mode (`html[data-mode="light"]`), plus accent variants.
- Works with the sidebar layout (desktop) and mobile sheets. The banner pushes content down; it must not overlay sticky headers.
- Touch target for Exit at least 44px tall on mobile.
- Reuse existing modal and button styles (`.btn`, existing modals) for the confirmation.
- No animation beyond existing patterns.

## Out of scope

Demo data content, storage logic, onboarding tour, a "Reset demo" control.

## Open design decisions

- Whether the banner shows an icon.

## Decided

- **Banner treatment: option A**, solid `--accent` strip with white text and an outlined-pill Exit button (translucent white fill, 1px white border). No warn tint, no dot.

## Mockups

`docs/specs/demo-mode-mockups.html`: open in a browser. Toggle dark/light with the button at the top.
