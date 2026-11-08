# Fetchlist

A checklist for gathering the cards a deck needs: import a deck list, track what you own, order or trade for, and mark it built.

## Language

**Collection**:
The cards the user already owns, keyed by lowercase card name, each with its Printings. It exists so decks can auto-tag owned cards; it is not a value tracker. There is one Collection, held by the Collection store (`src/store/collection.ts`).
_Avoid_: Inventory, library

**Printing**:
One set + collector number + foil combination of a card in the Collection, with a quantity. Two entries are the same Printing when set, collector number and foil match. Set codes match regardless of case (`MH2` and `mh2` are one set). Etched counts as foil: the Collection doesn't tell the two finishes apart. A card in a trade is the same Printing as a Collection entry when its set, collector number and foil-ness match.
_Avoid_: Version, copy

**Trade line**:
One row of a trade: a card, its finish, condition and price. Two Trade lines with the same Printing stay separate when their condition or price differ, so a Trade line is not a Printing.

**Collection meta**:
Where the Collection came from (file name, import time) and its card-name count. Absent until the first import or first card added.

**User data**:
What the user made and would be upset to lose: their decks, Collection, orders, trade log, deck errors and the trade in progress. Demo mode sets it aside and puts it back afterwards, and the app asks before replacing it.
_Avoid_: Profile, state

**Working state**:
What the app remembers about how the user works, rather than what they made: Collection meta, vendor history, the last vendor used, binder exclusions, and which hints were dismissed. Demo mode sets it aside like User data, so real and sample sessions don't mix, but losing it costs convenience, not the user's work.
_Avoid_: Settings, cache

**Preference**:
How the user likes the app to look: theme, accent, a collapsed sidebar, an open panel. It isn't tied to any data, so demo mode leaves it alone.
_Avoid_: Setting

**Backup**:
A single-file copy of the user's User data and the Working state worth keeping, made by exporting or by saving to Drive. *Importing* a Backup either merges it into this device's data or replaces it; *loading* from Drive always replaces. The trade in progress is never part of a Backup.
_Avoid_: Profile export
