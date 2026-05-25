# Fetchlist — Theme System Implementation Plan

## Context

The app currently has a single hardcoded dark theme via CSS custom properties in `:root` in `src/App.css`. The token names are already `var(--accent)`, `var(--bg)`, `var(--surface)`, etc. — the architecture is perfect for a data-attribute theme system that adds zero runtime overhead.

**Goal:** Light mode + 4 accent color variants, persisted to `localStorage`, with a UI to switch them.

**Design reference:** `theme-system-spec-2.html` in this project folder — the interactive spec with live preview.

---

## How the token system works

The core mechanic is two data attributes on `<html>`:

```html
<html data-mode="dark" data-accent="indigo">
```

```css
/* App.css */
:root { /* dark indigo defaults */ }
html[data-mode="light"] { /* surface overrides */ }
html[data-accent="sapphire"] { /* accent overrides */ }
html[data-accent="emerald"] { /* accent overrides */ }
html[data-accent="ember"] { /* accent overrides */ }
```

Mode and accent are **independent axes** — any combination works with no extra CSS. Switching is one `setAttribute` call.

---

## Step 1 — Expand `src/App.css` tokens

Replace the current `:root` block with the full token set and add the four override blocks below it.

### New `:root` block

```css
:root {
  /* Accent family */
  --accent:       #6c5ce7;
  --accent-hover: #8b7cf8;
  --accent-light: #a78bfa;
  --accent-deep:  #4c3dbf;

  /* Surfaces */
  --bg:        #0d0f1a;
  --surface:   #151829;
  --surface-2: #1e2238;
  --border:    #2d3258;

  /* Text */
  --text:       #eceef8;
  --text-muted: #9ba5c9;   /* bumped from #8890b8 for AAA contrast */

  /* Status */
  --danger:  #e05353;
  --success: #4ade80;

  /* Radii */
  --radius:      8px;
  --radius-sm:   4px;
  --radius-xs:   3px;
  --radius-pill: 99px;

  /* Gradients (derive from accent vars) */
  --grad-progress: linear-gradient(90deg,
    var(--accent-deep) 0%, var(--accent) 50%, var(--accent-light) 100%);

  /* Shadows */
  --shadow-sticky: 0 1px 12px rgba(0,0,0,.40);
  --shadow-menu:   0 4px 20px rgba(0,0,0,.50);

  /* Accent tints (for selection states, active rows, etc.) */
  --accent-tint-10: color-mix(in srgb, var(--accent) 10%, transparent);
  --accent-tint-12: color-mix(in srgb, var(--accent) 12%, transparent);
  --accent-tint-35: color-mix(in srgb, var(--accent) 35%, transparent);

  /* Rarity */
  --rar-common-fg:   #9ba5c9;
  --rar-uncommon-fg: #7cb9e8; --rar-uncommon-bg: rgba(124,185,232,.09);
  --rar-rare-fg:     #d4a017; --rar-rare-bg:     rgba(212,160,23,.09);
  --rar-mythic-fg:   #e8721a; --rar-mythic-bg:   rgba(232,114,26,.09);
  --rar-special-fg:  #c084fc; --rar-special-bg:  rgba(192,132,252,.09);

  /* Source tags */
  --src-owned-fg:    #4ade80; --src-owned-bg:    rgba(34,197,94,.18);
  --src-ordered-fg:  #60a5fa; --src-ordered-bg:  rgba(59,130,246,.18);
  --src-proxy-fg:    #c084fc; --src-proxy-bg:    rgba(168,85,247,.18);
  --src-deck-fg:     #facc15; --src-deck-bg:     rgba(234,179,8,.18);
  --src-buy-fg:      #f87171; --src-buy-bg:      rgba(239,68,68,.18);
  --src-borrow-fg:   #fb923c; --src-borrow-bg:   rgba(249,115,22,.18);
  --src-binder-fg:   #2dd4bf; --src-binder-bg:   rgba(20,184,166,.18);
  --src-storage-fg:  #94a3b8; --src-storage-bg:  rgba(148,163,184,.18);
}
```

### Light mode override block

```css
html[data-mode="light"] {
  --bg:         #f5f5fb;
  --surface:    #ffffff;
  --surface-2:  #ededf8;
  --border:     #deddf2;
  --text:       #1c1d2e;
  --text-muted: #464b74;   /* AAA on white: ~7.4:1 */

  --shadow-sticky: 0 1px 12px rgba(0,0,0,.07);
  --shadow-menu:   0 4px 20px rgba(0,0,0,.12);

  /* Rarity — darker fg for AA/AAA on white */
  --rar-common-fg:   #464b74;
  --rar-uncommon-fg: #1d4ed8; --rar-uncommon-bg: rgba(59,130,246,.10);
  --rar-rare-fg:     #92400e; --rar-rare-bg:     rgba(212,160,23,.10);
  --rar-mythic-fg:   #c2410c; --rar-mythic-bg:   rgba(232,114,26,.10);
  --rar-special-fg:  #6d28d9; --rar-special-bg:  rgba(192,132,252,.10);

  /* Source tags — darker fg for readability on near-white */
  --src-owned-fg:   #15803d; --src-owned-bg:   rgba(34,197,94,.13);
  --src-ordered-fg: #1d4ed8; --src-ordered-bg: rgba(59,130,246,.13);
  --src-proxy-fg:   #7c3aed; --src-proxy-bg:   rgba(168,85,247,.13);
  --src-deck-fg:    #92400e; --src-deck-bg:    rgba(234,179,8,.13);
  --src-buy-fg:     #dc2626; --src-buy-bg:     rgba(239,68,68,.13);
  --src-borrow-fg:  #c2410c; --src-borrow-bg:  rgba(249,115,22,.13);
  --src-binder-fg:  #0f766e; --src-binder-bg:  rgba(20,184,166,.13);
  --src-storage-fg: #475569; --src-storage-bg: rgba(148,163,184,.13);
}
```

### Accent variant blocks

```css
html[data-accent="sapphire"] {
  --accent:       #3b82f6;
  --accent-hover: #60a5fa;
  --accent-light: #93c5fd;
  --accent-deep:  #1d4ed8;
}
html[data-accent="emerald"] {
  --accent:       #10b981;
  --accent-hover: #34d399;
  --accent-light: #6ee7b7;
  --accent-deep:  #059669;
}
html[data-accent="ember"] {
  --accent:       #f59e0b;
  --accent-hover: #fbbf24;
  --accent-light: #fde68a;
  --accent-deep:  #d97706;
}
```

### Smooth transition block

```css
body, .app-header, .card-row, .checklist-row, .deck-row,
.source-tag, .rarity-badge, .progress-bar {
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}
```

---

## Step 2 — Audit `App.css` for hardcoded colors

Search `App.css` for raw hex values or `rgba()` calls that are **not** referencing `var(--…)`. Replace with token equivalents:

| Hardcoded value | Replace with |
|---|---|
| `#6c5ce7` (accent hex) | `var(--accent)` |
| `rgba(108,92,231,.10)` | `var(--accent-tint-10)` |
| `rgba(108,92,231,.12)` | `var(--accent-tint-12)` |
| `rgba(108,92,231,.35)` | `var(--accent-tint-35)` |
| `#0d0f1a` | `var(--bg)` |
| `#151829` | `var(--surface)` |
| `#1e2238` | `var(--surface-2)` |
| `#2d3258` | `var(--border)` |
| `#eceef8` | `var(--text)` |
| `#9ba5c9` or `#8890b8` | `var(--text-muted)` |

---

## Step 3 — Logo inversion for light mode

The `.app-logo` image uses `mix-blend-mode: lighten` which works on dark backgrounds but makes the logo invisible on light. Add:

```css
html[data-mode="light"] .app-logo {
  mix-blend-mode: normal;
  filter: invert(1) hue-rotate(180deg);   /* adjust to taste */
}
```

> **Note:** If the result looks off, `filter: brightness(0)` (pure black silhouette) is a safe fallback until a dedicated light-mode logo asset is provided.

---

## Step 4 — Create `src/hooks/useTheme.ts`

This hook owns the two `localStorage` keys and syncs them to the `<html>` element. Components call it to read state and get setters.

```ts
// src/hooks/useTheme.ts
import { useState, useEffect } from 'react';

export type ThemeMode   = 'dark' | 'light';
export type ThemeAccent = 'indigo' | 'sapphire' | 'emerald' | 'ember';

const MODE_KEY   = 'fl-theme-mode';
const ACCENT_KEY = 'fl-theme-accent';

function applyTheme(mode: ThemeMode, accent: ThemeAccent) {
  const el = document.documentElement;
  el.setAttribute('data-mode',   mode);
  el.setAttribute('data-accent', accent);
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem(MODE_KEY) as ThemeMode) ?? 'dark';
  });
  const [accent, setAccentState] = useState<ThemeAccent>(() => {
    return (localStorage.getItem(ACCENT_KEY) as ThemeAccent) ?? 'indigo';
  });

  // Apply on mount + whenever state changes
  useEffect(() => {
    applyTheme(mode, accent);
    localStorage.setItem(MODE_KEY, mode);
    localStorage.setItem(ACCENT_KEY, accent);
  }, [mode, accent]);

  const setMode    = (m: ThemeMode)     => setModeState(m);
  const setAccent  = (a: ThemeAccent)   => setAccentState(a);
  const toggleMode = () => setMode(mode === 'dark' ? 'light' : 'dark');

  return { mode, accent, setMode, setAccent, toggleMode };
}
```

### Flash-of-wrong-theme prevention

Add this inline script to `index.html` **before** any stylesheet, so the correct theme attributes are set before React hydrates:

```html
<!-- index.html <head> — place before any <link rel="stylesheet"> -->
<script>
  (function() {
    var mode   = localStorage.getItem('fl-theme-mode')   || 'dark';
    var accent = localStorage.getItem('fl-theme-accent') || 'indigo';
    document.documentElement.setAttribute('data-mode',   mode);
    document.documentElement.setAttribute('data-accent', accent);
  })();
</script>
```

---

## Step 5 — Create `src/components/ThemeToggle.tsx`

A small self-contained component that renders the mode toggle + accent swatches. It goes in the app header.

```tsx
// src/components/ThemeToggle.tsx
import { useTheme, type ThemeAccent } from '../hooks/useTheme';

const ACCENTS: { id: ThemeAccent; color: string; label: string }[] = [
  { id: 'indigo',   color: '#6c5ce7', label: 'Indigo'   },
  { id: 'sapphire', color: '#3b82f6', label: 'Sapphire' },
  { id: 'emerald',  color: '#10b981', label: 'Emerald'  },
  { id: 'ember',    color: '#f59e0b', label: 'Ember'    },
];

export function ThemeToggle() {
  const { mode, accent, toggleMode, setAccent } = useTheme();

  return (
    <div className="theme-toggle" aria-label="Theme settings">
      <button
        className="theme-mode-btn"
        onClick={toggleMode}
        title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-pressed={mode === 'light'}
      >
        {mode === 'dark' ? '☀' : '◑'}
      </button>

      <div className="theme-accents" role="radiogroup" aria-label="Accent color">
        {ACCENTS.map(a => (
          <button
            key={a.id}
            className={`theme-accent-dot ${accent === a.id ? 'active' : ''}`}
            style={{ background: a.color }}
            onClick={() => setAccent(a.id)}
            role="radio"
            aria-checked={accent === a.id}
            aria-label={a.label}
            title={a.label}
          />
        ))}
      </div>
    </div>
  );
}
```

### CSS for `ThemeToggle` (add to `App.css`)

```css
.theme-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
}

.theme-mode-btn {
  width: 32px; height: 32px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: border-color 0.15s, color 0.15s;
}
.theme-mode-btn:hover {
  border-color: var(--accent);
  color: var(--text);
}

.theme-accents {
  display: flex;
  gap: 4px;
}

.theme-accent-dot {
  width: 14px; height: 14px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  outline: none;
  transition: transform 0.15s, box-shadow 0.15s;
}
.theme-accent-dot:hover { transform: scale(1.2); }
.theme-accent-dot.active {
  box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px currentColor;
}
```

---

## Step 6 — Wire `ThemeToggle` into `App.tsx`

```tsx
import { ThemeToggle } from './components/ThemeToggle';

// Inside AppInner, in the header JSX — add after existing nav buttons:
<div className="app-nav">
  {/* ...existing nav buttons... */}
  <ThemeToggle />
</div>
```

---

## Step 7 — Audit source-tag and rarity CSS classes

Verify that all `.source-tag-*` and `.rarity-badge-*` class rules reference the CSS vars rather than hardcoded hex. Any `style={{ color: '#4ade80' }}` inline styles in TSX components need to be converted to class names that pull from the token.

Example pattern:
```css
/* App.css */
.source-tag-owned   { color: var(--src-owned-fg);   background: var(--src-owned-bg);   }
.source-tag-ordered { color: var(--src-ordered-fg); background: var(--src-ordered-bg); }
/* ...etc for all source types... */

.rarity-uncommon { color: var(--rar-uncommon-fg); background: var(--rar-uncommon-bg); }
/* ...etc for all rarities... */
```

---

## Step 8 — Test matrix

| Mode | Accent | Check |
|---|---|---|
| Dark + Indigo | Default | Existing tests pass, no visual regression |
| Dark + Sapphire | Blue accent | Nav, progress bar, active states update |
| Dark + Emerald | Green accent | Same |
| Dark + Ember | Amber accent | Same — check amber text-muted contrast on dark |
| Light + Indigo | Light surfaces | Rarity/source tags readable, logo visible |
| Light + Sapphire | Both override together | No bleed between mode and accent |
| Refresh (any combo) | — | State restored from `localStorage`, no FOWT flash |

---

## File checklist

| File | Change |
|---|---|
| `src/App.css` | New `:root`, light/accent override blocks, `ThemeToggle` CSS |
| `index.html` | Anti-flash inline script in `<head>` |
| `src/hooks/useTheme.ts` | **New file** |
| `src/components/ThemeToggle.tsx` | **New file** |
| `src/App.tsx` | Import + render `<ThemeToggle />` in header |
| `src/components/Checklist.tsx` | Replace any hardcoded color inline styles with class names |

---

## Notes

- The accent variants only override the `--accent` family tokens. All other tokens (surfaces, text, rarity, source tags) remain driven by `data-mode` alone. This keeps the two axes truly independent.
- `color-mix()` is supported in all modern browsers (Chrome 111+, Firefox 113+, Safari 16.2+). If you need to support older browsers, replace the `--accent-tint-*` vars with hardcoded `rgba()` per accent variant.
- The `☀ / ◑` emoji icons in `ThemeToggle` are placeholder — swap for your SVG icon system once available.
