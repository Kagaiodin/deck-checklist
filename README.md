# Fetchlist

A Magic: The Gathering deck acquisition tracker. Paste a decklist, validate it against Scryfall, then check off cards as you collect them physically.

## Features

- **Import decklists** — paste plain text, Moxfield export format, or a `.txt` file
- **Archidekt import** — paste an Archidekt deck URL to auto-import via CORS proxy
- **Scryfall validation** — all cards verified against the Scryfall API with fuzzy matching for typos
- **Acquisition tracking** — check off cards as you acquire them with a progress bar
- **Card sources** — tag each card: Owned, Ordered, Proxy, In binder, Need to buy, etc.
- **Bulk tagging** — select multiple cards and set a source tag in one action
- **Filters & grouping** — filter by color, type, source, or missing only; group by color, type, or source
- **Set & rarity badges** — each card shows its set code and colour-coded rarity (C/U/R/M)
- **Buy links** — send your "Need to buy" list to Manapool (pre-filled), TCGPlayer, or Card Kingdom
- **Export** — download missing cards or proxy list as `.txt`
- **Edit mode** — add, remove, or adjust card quantities after import
- **Multiple decks** — manage any number of decks, each stored locally in the browser
- **Mobile friendly** — responsive layout with bottom sheet pickers and touch-optimised controls

## Tech Stack

- **React 19** + TypeScript + Vite
- **Cloudflare Workers** + Workers Assets (handles CORS proxy for Archidekt)
- All data stored in `localStorage` — no account or backend required

## Getting Started

```bash
npm install
npm run dev          # local dev (no Worker proxy)
npm run preview      # full build with Cloudflare Worker (requires wrangler)
npm run deploy       # deploy to Cloudflare
```

> **Note:** Archidekt URL import requires the Cloudflare Worker proxy. Use `npm run preview` or a deployed environment — it won't work with plain `vite dev`.

## Supported Import Formats

| Format | Example |
|---|---|
| Plain decklist | `4 Lightning Bolt` |
| Moxfield export | `1 Sol Ring (SLD) 912 *F*` |
| Double-faced cards | `1 Bala Ged Recovery / Bala Ged Sanctuary (ZNR) 180` |
| Archidekt URL | `https://archidekt.com/decks/123456/my_deck` |
| `.txt` file | Any of the above, one card per line |

Set codes, collector numbers, foil markers, and back-face names are all stripped automatically.

## Contributing

Bug reports and feature requests are welcome via [GitHub Issues](../../issues). Please check existing issues before opening a new one.

## License

[MIT](LICENSE)
