# implementation-plan.md

## 1. Tech Stack Decision
Vite (build tool), React + TypeScript (frontend), localStorage (persistence). No external state management libraries or databases.

## 2. Architecture Overview
Monolithic React app with:
- **State**: useReducer + useContext for deck operations
- **Utils**: Parser (decklists), Validator (Scryfall), Dual-face handling
- **Components**: ErrorQueue, Checklist UI, ProgressTracker
- **Hooks**: LocalStorage integration for persistence
- **Types**: Shared TypeScript definitions

## 3. Components / Modules Affected
- `src/types/index.ts`
- `src/store/decks.ts`
- `src/utils/parser.ts`
- `src/utils/validator.ts`
- `src/components/ErrorQueue.tsx`
- `src/components/Checklist.tsx`
- `src/hooks/useLocalStorage.ts`
- `src/utils/dualface.ts`
- `src/components/ProgressTracker.tsx`

---

## 4. Ordered Task List

[STEP-0.1] Create shared TypeScript types in `src/types/index.ts`
- Define `Card` type (id, name, quantity, acquired, color, type)
- Define `Deck` type (id, name, cards, createdAt)
- Define `ErrorQueueItem` type (originalName, searchName, resolved)

[STEP-1.1] Create deck management context with useReducer + useContext in `src/store/decks.ts`
- Define initialState for deck operations
- Implement reducer for add/delete/rename actions
- Create context provider for deck state

[STEP-2.1] Implement decklist parser in `src/utils/parser.ts`
- Process `decklist_sample.txt` format (quantity + name)
- Return structured array of `{count: number, name: string}`
- Handle edge cases (empty lines, invalid formats)

[STEP-3.1] Create Scryfall validator in `src/utils/validator.ts`
- Use Scryfall `/cards/collection` endpoint (max 75 cards per POST)
- Validate parsed cards against Scryfall database
- Return error queue for invalid cards
- Dual-face cards identified via `card_faces[0].name` from Scryfall response

[STEP-4.1] Build ErrorQueue component in `src/components/ErrorQueue.tsx`
- Display validation errors with remapping UI
- Implement error filtering and action handlers
- Connect to validator output

[STEP-5.1] Create Checklist component shell and props interface in `src/components/Checklist.tsx`
- Define TypeScript interface for card data
- Set up basic component structure and props

[STEP-5.2] Add card list rendering in `src/components/Checklist.tsx`
- Render checkbox + quantity + card name per card
- Integrate with deck store and local storage

[STEP-5.3] Add color grouping toggle in `src/components/Checklist.tsx`
- Implement filter logic for card colors
- Add UI toggle switch for color grouping

[STEP-5.4] Add type grouping toggle in `src/components/Checklist.tsx`
- Implement filter logic for card types
- Add UI toggle switch for type grouping

[STEP-5.5] Add missing cards view in `src/components/Checklist.tsx`
- Filter display to show only unchecked cards
- Implement flat list view with search/filter

[STEP-6.1] Create `useLocalStorage` hook in `src/hooks/useLocalStorage.ts`
- Persist deck data to localStorage
- Add type-safe storage/retrieval functions
- Handle serialization/deserialization

[STEP-7.1] Add dual-face card handling in `src/utils/dualface.ts`
- Detect dual-face cards via Scryfall `card_faces` array
- Split into front/back faces for validation
- Handle special formatting requirements

[STEP-8.1] Implement ProgressTracker component in `src/components/ProgressTracker.tsx`
- Show import/validation progress percentages
- Add animated loader states
- Connect to parser/validator lifecycle

---

## 5. Risks / Edge Cases
- **Decklist parsing**: Malformed lines in user imports (e.g., "3 copies of 'Black Lotus'")
- **Storage limits**: Large decklists exceeding localStorage capacity
- **Validator latency**: Scryfall API rate limiting during bulk imports
- **Dual-face cards**: Inconsistent naming between Scryfall and user inputs
- **Error queue**: Concurrent imports causing state conflicts

---

## 6. Definition of Done
- All 12 features implemented with unit tests
- Deck operations (add/delete/rename) fully functional with useReducer + useContext
- Parser handles 100% of `decklist_sample.txt` format
- Validator returns accurate Scryfall results with batch support
- ErrorQueue supports remapping and filtering
- Checklist UI filters work with local storage
- Dual-face cards processed correctly via Scryfall `card_faces`
- ProgressTracker shows real-time updates
- No console errors in dev/prod builds