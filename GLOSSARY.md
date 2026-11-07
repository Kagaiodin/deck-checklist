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
