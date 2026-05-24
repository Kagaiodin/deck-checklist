# Design Handoff — Profile Export / Import
**Issue:** #19 — Allow saving of data for transport between instances  
**Branch:** `feature/19-profile-export-import`  
**Status:** Awaiting UX design  
**Date:** 2026-05-23

---

## 1. Problem Statement

Fetchlist stores all user data in browser localStorage. There is no way to:
- Move data to another device or browser
- Back up data before clearing the browser
- Share a profile with a friend or a second computer

This feature adds a one-click **Export** (download a JSON file) and a **Import** (upload that file) to solve all three use cases with zero server dependencies.

---

## 2. Data Scope

All six localStorage keys must be included in the export envelope:

| Key | Type | Description |
|-----|------|-------------|
| `mtg-checklist-decks` | `Deck[]` | All decks with cards, acquisition status, color identity |
| `mtg-checklist-errors` | `Record<deckId, ErrorQueueItem[]>` | Unresolved card name errors per deck |
| `mtg-checklist-collection-v2` | `Collection` (`Record<cardName, CollectionPrinting[]>`) | User's card collection |
| `mtg-checklist-collection-meta-v2` | `CollectionMeta \| null` | CSV provenance (filename, import date, card count) |
| `mtg-checklist-orders-v1` | `Order[]` | Purchase orders with tracking |
| `mtg-checklist-vendor-history` | `string[]` | Autocomplete history for vendor names |

### Export envelope (JSON)

```json
{
  "version": 1,
  "exportedAt": "2026-05-23T12:00:00.000Z",
  "decks": [ /* Deck[] */ ],
  "errors": { /* Record<string, ErrorQueueItem[]> */ },
  "collection": { /* Collection */ },
  "collectionMeta": { /* CollectionMeta | null */ },
  "orders": [ /* Order[] */ ],
  "vendorHistory": [ /* string[] */ ]
}
```

**Filename on download:** `fetchlist-backup-YYYY-MM-DD.json`  
(e.g. `fetchlist-backup-2026-05-23.json`)

---

## 3. User-Facing Flows

### 3a. Export (happy path)
1. User clicks **Export data** button.
2. Browser immediately downloads `fetchlist-backup-YYYY-MM-DD.json`.
3. No confirmation dialog — the action is non-destructive.
4. A brief success toast: _"Profile exported"_ (2 s, dismissable).

### 3b. Import — Merge mode (default)
1. User clicks **Import data** button → hidden `<input type="file" accept=".json">` fires.
2. User selects a `.json` file.
3. App validates the file:
   - Must be valid JSON.
   - Must have `version: 1` and at least one of `decks`, `collection`, or `orders`.
   - If invalid → inline error, no state change.
4. App merges the imported data into existing local state:
   - **Decks**: append decks whose `id` doesn't already exist locally; skip duplicates silently.
   - **Errors**: merge error arrays by deck id; skip if deck id already present.
   - **Collection**: for each card name key, union printings arrays (avoid exact-duplicate printings by comparing set + collectorNumber + foil).
   - **CollectionMeta**: keep existing if present; adopt imported if local is null.
   - **Orders**: append orders whose `id` doesn't exist locally.
   - **VendorHistory**: union of both arrays, deduplicated, capped at 50.
5. Success toast: _"Imported X decks, Y collection cards, Z orders"_ (counts of **new** items added, zeros omitted). Toast stays until dismissed.

### 3c. Import — Replace mode (power user)
- A **Replace all local data** toggle/checkbox appears on the import dialog (or as a second button option).
- When toggled on before selecting the file: existing localStorage is wiped before applying the imported data.
- Shows a confirmation: _"This will replace all your local decks, collection, and orders. Continue?"_
- Use case: clean transfer to a new device.

---

## 4. UI Placement

### Primary option (Recommended): Sidebar footer
Add a compact row at the bottom of the left sidebar (below the deck list), always visible. Two small ghost buttons:

```
┌─────────────────────────────────┐
│  Decks  · 12              + New │
│  [search…]                      │
│ ─────────────────────────────── │
│  [Deck 1]                    ×  │
│  [Deck 2]                    ×  │
│   …                             │
│ ─────────────────────────────── │
│  ↓ Export data   ↑ Import data  │  ← sidebar footer
└─────────────────────────────────┘
```

- Low-frequency actions: small, muted, ghost style.
- Always accessible regardless of which view (Decks / Collection / Orders) is active.
- Consistent with where you'd expect "profile-level" controls to live.

### Alternative: "⋯" overflow menu in the nav bar
A three-dot menu at the far right of the top nav bar. Keeps the sidebar uncluttered but adds a discovery hurdle.

### Alternative: Settings page / modal
A new "Settings" nav item. Most discoverable long-term but adds scope (new route/modal, empty state to design).

> **Design recommendation needed:** Which placement fits the visual language best? The sidebar footer is the lowest-friction option for implementation.

---

## 5. Edge Cases & Error States

| Scenario | Behavior |
|----------|----------|
| File is not valid JSON | Inline error: _"File could not be read. Make sure it's a Fetchlist backup (.json)."_ |
| File is valid JSON but missing `version` or all data keys | Inline error: _"This doesn't look like a Fetchlist backup file."_ |
| Future version file (`version > 1`) | Warning toast: _"This backup was made with a newer version of Fetchlist. Some data may not import correctly."_ — still attempt merge. |
| Zero new items after merge (all duplicates) | Toast: _"Nothing new to import — all items already exist locally."_ |
| Import while collection has no meta → imported file also has no meta | CollectionMeta stays null; no error. |
| Very large file (>10 MB) | Show loading spinner on the button during parsing; no explicit size limit. |

---

## 6. Component Architecture

```
src/
  features/
    profile/                          ← new feature folder
      ProfileExportImport.tsx         ← contains export handler, file input, merge logic
      ProfileExportImport.css
  types/index.ts                      ← add ProfileExport interface
```

### New type

```ts
// types/index.ts
export interface ProfileExport {
  version: 1;
  exportedAt: string;               // ISO 8601
  decks: Deck[];
  errors: Record<string, ErrorQueueItem[]>;
  collection: Collection;
  collectionMeta: CollectionMeta | null;
  orders: Order[];
  vendorHistory: string[];
}
```

### Props interface

```tsx
interface ProfileExportImportProps {
  // Read access for export
  decks: Deck[];
  errors: Record<string, ErrorQueueItem[]>;
  collection: Collection;
  collectionMeta: CollectionMeta | null;
  orders: Order[];
  vendorHistory: string[];

  // Write access for import merge
  onImport: (data: ProfileExport) => void;
}
```

### Export implementation sketch

```ts
function handleExport() {
  const payload: ProfileExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    decks, errors, collection, collectionMeta, orders, vendorHistory,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `fetchlist-backup-${new Date().toISOString().slice(0, 10)}.json`,
  });
  a.click();
  URL.revokeObjectURL(url);
}
```

### Merge logic sketch (in App.tsx `onImport` handler)

```ts
function handleImport(data: ProfileExport, replace = false) {
  if (replace) {
    setSavedDecks(data.decks);
    setAllErrors(data.errors);
    setCollection(data.collection);
    setCollectionMeta(data.collectionMeta);
    setOrders(data.orders);
    setRecentVendors(data.vendorHistory);
    return;
  }

  // Decks — skip duplicates by id
  const existingIds = new Set(savedDecks.map(d => d.id));
  const newDecks = data.decks.filter(d => !existingIds.has(d.id));
  setSavedDecks([...savedDecks, ...newDecks]);

  // Errors — merge by deck id
  const mergedErrors = { ...allErrors };
  for (const [id, items] of Object.entries(data.errors ?? {})) {
    if (!mergedErrors[id]) mergedErrors[id] = items;
  }
  setAllErrors(mergedErrors);

  // Collection — union printings per card name
  const mergedCollection = { ...collection };
  for (const [name, printings] of Object.entries(data.collection ?? {})) {
    const existing = mergedCollection[name] ?? [];
    const deduped = [...existing];
    for (const p of printings) {
      const dup = deduped.some(
        e => e.set === p.set && e.collectorNumber === p.collectorNumber && (e.foil ?? false) === (p.foil ?? false)
      );
      if (!dup) deduped.push(p);
    }
    mergedCollection[name] = deduped;
  }
  setCollection(mergedCollection);

  // CollectionMeta — adopt if local is null
  if (!collectionMeta && data.collectionMeta) setCollectionMeta(data.collectionMeta);

  // Orders — skip duplicates by id
  const existingOrderIds = new Set(orders.map(o => o.id));
  const newOrders = (data.orders ?? []).filter(o => !existingOrderIds.has(o.id));
  setOrders([...orders, ...newOrders]);

  // Vendor history — union, deduplicated, cap at 50
  const merged = [...new Set([...recentVendors, ...(data.vendorHistory ?? [])])].slice(0, 50);
  setRecentVendors(merged);
}
```

---

## 7. Files to Touch

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `ProfileExport` interface |
| `src/features/profile/ProfileExportImport.tsx` | New component: export button, file input, import button, merge-mode toggle |
| `src/features/profile/ProfileExportImport.css` | Sidebar footer styles, import dialog, toast |
| `src/App.tsx` | Pass all state as props to `ProfileExportImport`; implement `handleImport` merge handler; add `<ProfileExportImport>` to sidebar footer |
| `src/App.css` | Sidebar footer layout styles (if not in feature CSS) |

---

## 8. Design Deliverables Requested

1. **Sidebar footer layout** — how do Export / Import buttons look within the sidebar's visual rhythm? Ghost style? Icon + label? Just icons with tooltip on hover?
2. **Import dialog / inline panel** — where does the Replace toggle live? Is it a modal, a slide-down in the sidebar, or an inline panel?
3. **Toast / confirmation messages** — style and positioning (top-right corner? bottom-center? inline?). Should match any future toast system.
4. **Error state** — what does an inline file-read error look like inside the sidebar?
5. **Mobile** — sidebar collapses to a bottom sheet on narrow viewports. How do Export / Import surface in that state?

---

## 9. Out of Scope (this issue)

- Server-side storage / sync (issue #13)
- Partial export (e.g. export one deck only)
- Export as CSV
- Automatic cloud backup

---

## 10. Acceptance Criteria

- [ ] Clicking Export immediately downloads a valid `.json` file containing all 6 data domains.
- [ ] Importing a valid backup file in merge mode adds only net-new items.
- [ ] Importing in replace mode after confirmation wipes and restores all data.
- [ ] Invalid files show a clear inline error without modifying any state.
- [ ] Success/failure is communicated via toast with item counts.
- [ ] `tsc -b` passes with no new type errors.
- [ ] Works on Chrome, Safari, Firefox (no File API polyfills required — all modern browsers support it).
