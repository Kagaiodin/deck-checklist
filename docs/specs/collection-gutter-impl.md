# Collection page — horizontal gutter & max-width (Variant B)

Small, focused change layered on top of `collection-page-redesign-impl.md`. Goal: stop the linear-style Collection page from bleeding edge-to-edge at wide viewports. Cap the content column, center it, and keep a solid floor padding so it never kisses the viewport edge on smaller windows.

Reference mock: `collection-gutter-options.html` (Variant B section, dashed guides mark the cap).

## What changes

- The Collection page gets a single centered container that holds **both** the 48px top bar and the list area (so the rarity stripe, top-bar controls, and list rows all align to the same gutters).
- Max content width: **1320px**.
- Horizontal floor padding: **32px** on each side (24px below 600px — handled by the existing mobile impl).
- Vertical rhythm and all internal component styling stays exactly as it is today. This is purely a container-level change.

## File-by-file

### 1. Collection page shell (the component that renders top bar + list)

Wrap the existing top bar and list area in a single container:

```jsx
<div className="collection-page">
  <div className="collection-container">
    {/* existing top bar */}
    {/* existing stats/provenance line */}
    {/* existing list (rows + alpha rail) */}
  </div>
</div>
```

`.collection-page` keeps any full-bleed background (page bg color, etc.).
`.collection-container` is the new centered, max-width wrapper.

### 2. CSS

```css
.collection-page {
  width: 100%;
  background: var(--bg);
}

.collection-container {
  max-width: 1320px;
  margin: 0 auto;
  padding: 0 32px;
}

@media (max-width: 768px) {
  .collection-container {
    padding: 0 16px;
  }
}
```

### 3. Top bar — remove any existing edge-anchored padding

If the top bar currently uses `padding: 0 24px` or similar to inset from the viewport, **remove that** — the new container handles horizontal insets. The top bar itself should be `padding: 0` on the sides (vertical padding stays). The 48px height stays.

### 4. Rarity stripe alignment

The 3px rarity stripe currently sits flush to the row's left edge. After this change, "flush to the row's left edge" means flush to the container's inner edge (32px from viewport). That is correct — leave the stripe styling alone, it inherits the new boundary automatically.

### 5. List scroll container

If the list has its own scroll container with horizontal padding, **remove that horizontal padding** as well — the parent container now owns the gutter. Vertical scroll behavior is unchanged.

### 6. Alpha rail

The alpha rail sits at the right edge of the list. After the change it sits at the right inner edge of the container (32px from viewport at wide widths, hugging the 1320px cap on ultra-wide). No styling change required — it inherits.

## Mobile (<768px)

Mobile already has its own header layout per `collection-mobile-impl.md`. The container's `padding: 0 16px` floor applies there too — make sure the mobile FAB still respects safe-area inset and is positioned relative to the viewport (not the container), so it stays in the bottom-right corner regardless of container width.

```css
@media (max-width: 768px) {
  .collection-fab {
    position: fixed;
    right: max(16px, env(safe-area-inset-right));
    bottom: max(16px, env(safe-area-inset-bottom));
  }
}
```

## Acceptance checklist

**P0**
- [ ] At 1920px viewport: content is centered, capped at 1320px; left/right of the container shows page bg.
- [ ] At 1440px viewport: 32px gutter on each side, content fills the rest.
- [ ] At 1024px viewport: 32px gutter on each side, content fills the rest.
- [ ] At 768px viewport: 16px gutter on each side (mobile floor).
- [ ] Top bar, stats line, list rows, and alpha rail all align to the same left and right inner edges.
- [ ] Rarity stripe sits flush to the container's inner left edge, not the viewport edge.
- [ ] `+ Add` button sits flush to the container's inner right edge, not the viewport edge.

**P1**
- [ ] No horizontal scroll at any viewport from 360px → 2560px.
- [ ] Decks page gutter rhythm and Collection page gutter rhythm match visually when toggling between tabs at the same window width.

**P2**
- [ ] Ultra-wide (≥2560px): no visible stretching artifacts; container caps cleanly.

## Out of scope

- Any change to row internals, stats line content, filter chip behavior, or expansion behavior.
- Theme system / light mode work.
- The right-edge `N free` chip simplification (separate spec).
