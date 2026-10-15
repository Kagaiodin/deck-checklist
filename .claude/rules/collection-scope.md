---
paths:
  - "src/features/collection/**"
  - "docs/specs/collection-*"
---

# Collection page — vision check

The app's core purpose is a sleeving/acquisition checklist: import a deck list, track what
you're gathering or ordering, mark it built. The collection tab is a supporting inventory
tool — it lets you upload your existing cards so decks auto-tag what you already own. It is
NOT a portfolio or collection-value tracker.

Before adding any feature to the collection page, ask: does this serve deck acquisition, or
does it make the collection a destination in its own right? If the latter, it's probably
scope creep and should not be built.

Things that usually fail this check: pricing or set-value tracking, wishlists, trade binders,
and browsing/filtering beyond what's needed to cross-reference a deck's needs.

Trade/surplus features are tracked separately (#109, #44, #116) — read the issue and its
spec before applying this rule to them.
