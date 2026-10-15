---
paths:
  - "src/**/*.css"
---

# CSS structure

- `src/tokens.css` — all CSS custom properties: reset, `:root` (dark mode), light mode
  overrides, and accent variants. Import this first.
- `src/App.css` — component and layout styles (~2500 lines). Run `npm run css:index` for a
  compact `<line> <section>` list, then read only that range (offset/limit). Don't read the
  whole file.
