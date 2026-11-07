# The Collection is one in-memory external store

App and CollectionPage each held their own `useLocalStorage` copy of the Collection, and the copies drifted: order receive, trade logging and backup merge wrote over edits made on the Collection page (#189, #191). The Collection now lives in one module-level store (`src/store/collection.ts`, read with `useCollection()`), and its in-memory value is the source of truth, written through to the same localStorage keys. `DeckProvider` subscribes and re-tags decks on every Collection change, so writers never dispatch `APPLY_COLLECTION` themselves.

## Considered Options

- **Re-read localStorage on every use** (what the #189 `readCollection()` thunks did): fixes one path at a time and leaves every other copy stale.
- **Lift the Collection into React context**: works, but the order and trade hooks and non-React callers (backup import) would still need a ref to read it fresh.
- **Cross-tab sync via the `storage` event**: left out on purpose. Decks don't sync across tabs, so re-tagging decks from another tab's Collection would clobber this tab's decks.

## Consequences

- The store loads lazily on first read, so `refreshStaleDemo()` in `main.tsx` must keep running before anything reads it.
- Tests share the singleton; `src/test/setup.ts` calls `resetForTests()` before each test, and a test that remounts with new stored data must reset it too.
- Tagging that happens without a Collection change (cancelling an order, unmarking a deck as built, importing a deck) stays explicit and reads `collectionStore.get()`.
