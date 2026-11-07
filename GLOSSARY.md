# Fetchlist

A checklist for gathering the cards a deck needs: import a deck list, track what you own, order or trade for, and mark it built.

## Language

**Collection**:
The cards the user already owns, keyed by lowercase card name, each with its Printings. It exists so decks can auto-tag owned cards; it is not a value tracker. There is one Collection, held by the Collection store (`src/store/collection.ts`).
_Avoid_: Inventory, library

**Printing**:
One set + collector number + foil combination of a card in the Collection, with a quantity. Two entries are the same Printing when set, collector number and foil match (`samePrinting`).
_Avoid_: Version, copy

**Collection meta**:
Where the Collection came from (file name, import time) and its card-name count. Absent until the first import or first card added.
