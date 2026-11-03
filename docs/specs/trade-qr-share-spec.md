# Trade QR Share — Tech Spec

Issue: #119. Related: #109 (trade binder), #116 (trade IA decision), #108 (shareable checklist links — not in scope, see Non-goals).

## Vision check

Serves the trade flow only: removes the "get this link to the other person's phone" step when trading face-to-face. Adds no persistent chrome and no new data. Not a collection feature.

## Scope (v1)

A "Show QR" action beside the existing copy-link button on the Trade page. It opens a modal containing a QR code for the **same share URL** `share()` produces. Scanning opens the trade read-only, identical to a pasted link.

## Facts established from the code

- `share()` in `src/features/trade/TradeWorkspace.tsx` builds the URL via `buildShareUrl(window.location.origin, await encodeTrade(trade))` (`src/utils/tradeShare.ts`).
- The payload is `v1.` + deflate-compressed, base64url JSON (mixed case), so QR **byte mode** applies. Alphanumeric mode is not usable.
- `MAX_SHARE_URL_LENGTH = 4000`. The QR hard ceiling is ~2,953 bytes (version 40, level L), so the link cap cannot be used for QR. Phone-camera reliability degrades well below the hard ceiling.
- The existing share row is `.tr-share-row` in `ControlPanel.tsx` (`onShare` prop wired from `TradeWorkspace`).
- `src/features/trade/components/` already has `TradeSheet.tsx`, `Popover.tsx`, and `ForkConfirmDialog.tsx`; check these for a reusable overlay/focus-trap pattern before writing a new one.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | QR length cap | New `MAX_QR_URL_LENGTH = 1200` chars, error-correction level **L**. Tune by scanning real codes during UAT. Copy-link keeps its 4000 cap. |
| 2 | Library | Small client-side encoder (`uqr` or `qrcode-generator`; pick the smaller in a measured comparison, record the numbers in the PR). Render to **inline SVG**. Loaded via dynamic `import()` only when the modal opens. No in-repo encoder, no third-party QR image API. |
| 3 | UI | Centered modal: QR, one-line caption, Close button. QR sits on a fixed high-contrast light background in both themes. Design options to be produced via Open Design (see Design handoff). |
| 4 | Origin | Keep `window.location.origin`. Disable "Show QR" with an explanatory tooltip when hostname is `localhost` / `127.0.0.1`. No config knob. |
| 5 | Reuse | Generic `QrCodeModal` taking `url`, `title`, `caption`, placed outside `features/trade/` (e.g. `src/components/QrCodeModal.tsx`). Wired only to Trade in v1. |

## Behavior

1. User taps **Show QR**.
2. App encodes the trade (`encodeTrade`) and builds the URL with `buildShareUrl`.
3. If `url.length > MAX_QR_URL_LENGTH`: modal shows "Too many cards for a QR code. Copy the link instead." with a **Copy link** button (reuses the existing copy path, including the existing text fallback above 4000). No QR is rendered.
4. Otherwise the QR chunk loads (brief loading state) and the SVG renders.
5. Esc / backdrop click / Close dismisses and returns focus to the Show QR button.

The URL contains the trade payload and is generated entirely on-device; nothing is sent to a server.

## Implementation notes

- Add `isQrUrlTooLong(url)` and `MAX_QR_URL_LENGTH` next to `isShareUrlTooLong` in `src/utils/tradeShare.ts`.
- Extract the URL-building half of `share()` so Copy link and Show QR share one code path (no drift between the two URLs).
- `QrCodeModal` owns lazy loading of the encoder; callers pass a string. Failure to load the chunk shows an inline error with Retry (offline PWA/Workers edge case).
- SVG gets `role="img"` and an `aria-label` ("QR code for this trade"). Caption text is real DOM text, not part of the SVG.
- Modal: focus trap, `aria-modal`, labelled by its title, Esc to close. Reuse the existing dialog/sheet pattern if suitable.
- Workers compatibility: encoder must be pure JS with no Node built-ins; verify the production build.
- Styles: add to `src/features/trade/TradePage.css` / a section in `src/App.css` per the existing token usage; use tokens from `src/tokens.css`, no hard-coded colors apart from the QR light surface (define as a token).

## Tests (per CLAUDE.md)

- `src/utils/__tests__/tradeShare.test.ts`: `isQrUrlTooLong` boundary (1200 / 1201); QR cap is lower than link cap.
- `src/components/__tests__/QrCodeModal.test.tsx`: renders SVG for a URL; too-long state shows message and no SVG; Esc and Close dismiss and restore focus; load-failure shows Retry. Mock the dynamic import of the encoder (jsdom has no need to verify a scannable matrix; assert the module is called with the URL and that an `svg` is rendered).
- `src/features/trade/__tests__/ControlPanel.test.tsx` / `TradePage.test.tsx`: Show QR button present; opens modal with the same URL Copy link would copy; disabled on localhost.
- `npm run test:coverage` must pass before commit.

## Non-goals

- Scanning QR codes inside the app.
- QR for checklist links (#108); the generic modal makes this cheap later, but it is not wired now.
- Server-side or third-party QR generation.
- Downloading/saving the QR as an image.
- Shortened URLs or a link-shortener service (would break "payload never leaves the device").

## Open items

- Final `MAX_QR_URL_LENGTH` value — confirm with real-device scan tests at ~1200 vs 800 chars.
- Library pick — pending measured gzip size of `uqr` vs `qrcode-generator` after dynamic-import splitting.
- Modal visual design — see below.

## Design handoff (Open Design)

Per CLAUDE.md, new visual direction goes through Open Design first, then implementation from the local artifact. Brief for Open Design:

- Centered modal on the Trade page, triggered from the `.tr-share-row` next to the primary share/copy button.
- Contents: title ("Scan to open this trade"), QR on a light surface with a quiet-zone margin, one-line caption (read-only, opens in their browser), Close.
- States to design: loading, rendered, too-many-cards (with Copy link CTA), load-failed (Retry), disabled trigger with tooltip.
- Both themes; mobile-first width, QR sized to be scannable from another phone (~240–280px).
- Where the "Show QR" button sits relative to the existing share button (secondary style, minimally invasive).

Save the resulting artifact locally and implement from the file (do not pull via MCP).

## Routing

Existing page + new modal → design options from Open Design, approval, then implement on `feat/trade-qr-share`.
