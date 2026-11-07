# Coding standards

Judgement calls a reviewer should hold code to. Anything a tool can check (lint, types, the storage-key scan in `src/__tests__/storageKeys.test.ts`) is enforced there instead, not here. Project setup and workflow are in `CLAUDE.md`.

## Names come from the glossary

Name identifiers with `GLOSSARY.md` terms: `collection`, `printing`, `collectionMeta`, not `inventory`, `version` or `copy`. A store module exports a `<thing>Store` (`collectionStore`, type `CollectionStore`). If you need a domain word the glossary lacks, add it there rather than inventing a synonym.

## Shared persisted state lives in one external store

Persisted state that more than one part of the app reads or writes lives in one module-level store under `src/store/` ([ADR 0001](docs/adr/0001-collection-external-store.md)). Do not keep a second `useLocalStorage` copy of it. Two copies of the Collection drifted and lost edits (#189, #191).

- Components and providers import the singleton (`collectionStore`, `useCollection()`), as `App.tsx` and `CollectionPage.tsx` do.
- Hooks receive the store as a dependency instead of importing it, so tests can pass `memoryCollectionStore()`. See `useTradeLedger({ collectionStore })` and `useOrderActions({ collectionStore, ... })`.

## The store derives its own values

Values computed from a store's state belong to the store, not its callers. The Collection's `cardCount` is one example: `collectionStore.update()` keeps it in step with the Collection. Callers pass the new state plus anything only they know, such as a `source` label or an import's file name. They do not compute counts or meta themselves.

Known exception: the backup-merge path in `App.tsx` computes `cardCount` before calling `collectionStore.replace()`. A store method that keeps the count should replace it.

## Hooks take readers, not render-time values

A handler that runs later (on click, after an await) must read current state, not the value captured at the last render. Pass hooks something to read from: a store or a `get()` function. Do not pass the value itself. `useTradeLedger` reads `collectionStore.get()` when a trade is logged. A captured value goes stale as soon as another writer changes the state between render and call, which is how #189 happened.

Known exception: `useOrderActions` still takes `orders` as a value. Move it to a reader when that hook is next changed.
