# Binder Share link: Implementation Spec

**Feature:** a "Share" action on the Binder that copies a read-only Share link. Opening the link shows that Binder.
**Status:** Ready for implementation (grilled 2026-11-09)
**Issues:** #184 (this), #108 (checklist links, builds on §2), #119 (QR code, builds on §2), #223 (Scryfall rate limits; not needed here, see §2)
**Glossary:** **Binder**, **Share link** (`GLOSSARY.md`)

Everything happens in the browser. A Share link carries its snapshot in the URL hash, so the data never reaches a server, Cloudflare or analytics. Opening one never writes to the viewer's storage.

---

## 1. Scope

**v1:**
- A Share button on the Binder.
- A binder payload format.
- The read-only shared-Binder view.
- A name search on the Binder, both shared and the user's own.
- The share-encoding code moves into a shared module.

**Not in v1** (filed as follow-ups):
- Highlighting shared cards the viewer's decks need.
- "Start a trade" seeded from a shared Binder.
- A subset picker. "Keep these" is the way to hide a card.
- Prices. Condition isn't recorded in the Collection.
- Printings. A shared row is a card name and a spare count. Seeing one card's printings is #226.

## 2. Shared encoding: `src/utils/shareCodec.ts`

- Move `toBase64Url`, `fromBase64Url` and `pipe` out of `src/utils/tradeShare.ts` and add two functions:
  ```ts
  encodePayload(json: unknown, format: "deflate" | "deflate-raw"): Promise<string>   // base64url, no prefix
  decodePayload(b64: string, format: "deflate" | "deflate-raw"): Promise<unknown>    // throws on corrupt input
  ```
  Callers own the version prefix, the hash key and the shape checks.
- **Trade links don't change.** They stay `#trade=v1.` with zlib `deflate`. `encodeTrade` and `decodeTrade` call the codec. The existing `tradeShare` tests are the regression check, and must pass with no changes to the tests.
- `MAX_SHARE_URL_LENGTH` (4000) moves to the codec, and so does `isShareUrlTooLong`. The cap is set by chat apps (Discord's free message limit is 2000), not by browsers.
- **Card names stay in the link.** Identifying cards by set + collector number would make links about 3× smaller. The cost is a Scryfall lookup every time a link opens, which brings in Scryfall's rate limits (#223) and needs a connection. Revisit only if real Binders often go over the cap, and only once #223's client exists. If the cap becomes a problem, try a bundled card-name list first (#227, ~2,700 cards, no server). Short links backed by encrypted storage (#228) are parked as the first backend.

## 3. Binder payload: `src/utils/binderShare.ts`

- **Hash:** `#binder=v1.<payload>`. A binder link can't be mistaken for a trade link because the hash key differs. The version is per link type.
- **Compression:** `deflate-raw`. It's new, so there's no reason to carry zlib's header and checksum.
- **Wire shape:** minified JSON arrays, with no keys and no objects per card (measured about 13% smaller than trade-style objects):
  ```ts
  type WireBinder = [v: 1, t: number, rows: WireRow[]];
  type WireRow = [name: string, spare: number];
  ```
  - `name` is the display name (`BinderRow.name`). `spare` is `BinderRow.surplus`.
  - **No printings.** Collector numbers barely compress. One printing per row costs about 6 more characters per card, and every printing costs about 9. That would cut the cap from about 300 names to 175–200. Copies are free: four spare copies are one row with `spare: 4`.
- **Contents:** the Binder exactly as the user sees it, `rows` only. Cards under "Keep these" are never sent.
- **Functions:**
  - `encodeBinder(rows, now)` builds the link payload.
  - `buildBinderShareUrl(origin, payload)` gives `${origin}/#binder=${payload}`.
  - `extractBinderPayload(hash)` returns the payload part of the hash, or null when it isn't a binder link.
  - `decodeBinder(payload)` returns `{ ok: true; rows: SharedBinderRow[]; sharedAt: number } | { ok: false; reason: "version" | "malformed" }` and never throws.
    - **Version:** check the prefix first, as `decodeTrade` does. An unknown `vN` gives `"version"`.
    - **Shape checks:** each row is exactly `[name, spare]`, where name is a non-empty string and spare is a whole number ≥ 1. Anything else gives `"malformed"`.
- **`binderToText(rows)`:** one line per card, `2× Lightning Bolt`. Used for the over-cap fallback.

**Measured on the 114-name demo Collection:** about 1,500 characters, or about 13 per unique card name. Expect about 300 names to fit under the cap, and about 150 under Discord's 2000.

## 4. Sharing (`BinderPanel.tsx`)

- **Placement:** a "Share" button (`btn btn-ghost btn-sm`) in the existing `binder-meta` row, before "Keep these". It shows only when `rows.length > 0`. No new persistent chrome.
- **Click:** builds the URL.
  - **Within the cap:** copies the link and shows the toast "Link copied — it opens read-only for them".
  - **Over the cap:** copies `binderToText(rows)` and shows "Too many cards for a link — copied as text instead".
  - **Clipboard blocked:** "Couldn't copy — clipboard access was blocked".

  These are the same three outcomes and wording as trade sharing (`TradeWorkspace.share`).
- Reuse the trade feature's copy helper and toast if they can be imported cleanly. If not, use the Binder's own `role="status"` toast, which already exists for Undo.

## 5. Opening a link

- **Routing (`App.tsx`):** `/#binder=…` opens Transactions → Binder. It's handled alongside `openedWithTradeLink()` and the `hashchange` listener. Trade links behave exactly as before.
- **Hash handling:** generalise `clearTradeHash` in `src/features/trade/tradeHash.ts` to clear any Share-link hash, or add a sibling `clearShareHash` and use it for both.
- **Banner** (the panel shows the *shared* Binder in place of the viewer's own while the hash is a binder link):
  - Reads "Shared Binder · Shared {Mon D} · {N} cards", with a "Back to my Binder" button.
  - "Back to my Binder" clears the hash and shows the viewer's own Binder.
  - The date comes from `sharedAt`.
- **Shared rows** reuse the Binder row markup:
  - Name and spare count only: no subtitle, no printings toggle, no phone row sheet.
  - No Exclude, no "Add to new trade", no "Keep these", no Share button.
- **States:**
  - **Decoding:** "Opening shared Binder…".
  - **Version:** the `EmptyState` "This link needs a newer version" (Reload / Back to my Binder).
  - **Malformed:** "This Binder link is broken" (Back to my Binder).
  - **Empty decode:** a link with zero rows shows "Nothing in this Binder".

  The copy follows `TradePage`'s link states.
- **Storage:** opening, browsing or closing a shared Binder writes nothing to storage. That holds in demo mode, and when the viewer has no data of their own. No new storage keys. The demo banner and the shared-Binder banner can both show.

## 6. Search

- A name search box (`type="search"`, label "Search Binder") above the list, in both the user's own Binder and a shared one.
- It filters rows by a case-insensitive substring match on the name. The meta line counts reflect the filtered rows.
- When nothing matches, show the inline message "No cards match "{q}"", not an `EmptyState`.
- The search text isn't persisted, and it clears when the Binder switches between shared and own.

## 7. Tests

- **`src/utils/__tests__/shareCodec.test.ts`:** round trip for both formats, and corrupt input throws.
- **`src/utils/__tests__/tradeShare.test.ts`:** unchanged and still passing.
- **`src/utils/__tests__/binderShare.test.ts`:**
  - Round trip of names and spare counts. Printings on the source rows aren't encoded.
  - Rows from "Keep these" aren't encoded.
  - An unknown version gives `"version"`. Garbage, truncated input and bad row shapes give `"malformed"`.
  - A 600-card Binder is over the cap.
  - `binderToText` output.
- **`src/features/transactions/binder/__tests__/BinderPanel.test.tsx`:**
  - Share copies a link, or text when over the cap. Use a stubbed clipboard.
  - Share is hidden on an empty Binder.
  - Search filters, and shows the no-match message.
- **Shared-view component test:** banner text, read-only rows (no Exclude or "Add to new trade" buttons), the version and broken states, and "Back to my Binder".
- **App-level (`renderApp({ storage })`):**
  - Opening `/#binder=…` lands on Transactions → Binder showing the shared rows.
  - Storage is byte-for-byte unchanged after opening and closing. Check with and without demo mode active.
  - A `#trade=` link still opens the trade calculator.

## 8. Demo

No change to demo data or `demoData.test.ts`. Sharing reads the Binder the demo already derives, and the shared view reads only the link. Say so in the PR.

## 9. Follow-ups this unblocks

- **#108, checklist links:** add `#deck=v1.` on the §2 codec. Deck cards record a set but no collector number, so names stay in that link too.
- **#119, QR code:** encode the same URL. Phones scan codes above about 1,000–1,500 characters badly, so the QR cap should be lower than the link cap. Decide it in #119.
