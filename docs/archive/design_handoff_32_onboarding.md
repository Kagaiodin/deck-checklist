# Design Handoff — Issue #32: First-Run Onboarding

**Status:** Ready for design  
**GitHub issue:** [#32 — First-run onboarding modal](https://github.com/Kagaiodin/deck-checklist/issues/32)  
**Prepared by:** Engineering  
**Priority:** High — blocking adoption; new users currently land with no context

---

## 1. Problem

A brand-new user who lands on Fetchlist sees this:

```
┌─────────────────────────────────────────────────────────┐
│  [Fetchlist logo]    Decks  Collection  Orders  Feedback │
├──────────────────────────────────────────────────────────┤
│  Decks · 0   [+ New] [▲]                                 │
│  ─────────────────────────────────────────────────────   │
│  No decks yet. Import one to get started.                │
│                          │                               │
│                          │                               │
│   Select a deck from the sidebar, or import a new one.  │
│              [Import Deck]                               │
└─────────────────────────────────────────────────────────┘
```

There's no explanation of:
- What Fetchlist does (it's not a deck builder — it's an acquisition tracker)
- What "source tagging" means and why it matters
- That there's a collection CSV upload that auto-tags cards
- The order tracking system

The result: users import a deck, see a list of cards with no checkmarks, and bounce because the value proposition isn't obvious.

---

## 2. Goals

1. **Reduce time-to-first-value** — get users to their first "aha" moment (seeing their deck tagged with cards they already own) as quickly as possible
2. **Set correct expectations** — Fetchlist is not a deck builder; it's a tracker for cards you need to acquire
3. **Surface the two highest-value features upfront:** source tagging + collection import
4. **Not be annoying** — dismissable, non-blocking, not a mandatory wall

---

## 3. Trigger & Persistence

**Show when:**
- `localStorage["mtg-checklist-decks"]` is empty (or absent) on first page load
- AND `localStorage["fetchlist-onboarding-dismissed"]` is not set

**Dismiss when:**
- User clicks any explicit dismiss action ("Get started", "Skip", ✕)
- Set `localStorage["fetchlist-onboarding-dismissed"] = "1"` permanently

**Recall:** No forced recall — if the user dismisses, it's gone. A "?" help button in the header (existing Feedback button area) could reopen it later, but that's out of scope for this issue.

---

## 4. Content — What Must Be Communicated

### Step 1 — What is Fetchlist?

**Headline:** Track what you need to get, not just what you want to build

**Body:**
> Import any MTG decklist and Fetchlist turns it into an acquisition checklist. Tag each card as Owned, Ordered, Proxied, or Need to Buy — then track your progress card by card.

**Visual cue:** A card row showing the source tag badge states (owned → green, ordered → blue, need_to_buy → red)

**CTA:** "Next →"

---

### Step 2 — The fast path: upload your collection

**Headline:** Already own cards? Let Fetchlist find them automatically.

**Body:**
> Export your collection from Moxfield as a CSV and upload it here. Fetchlist will automatically tag every card you already own across all your decks — no manual tagging needed.

**Visual cue:** The collection upload area / CSV import UI

**Secondary note:** "Don't use Moxfield? You can tag cards manually or add them one at a time from the Collection tab."

**CTA:** "Upload collection" (links to Collection tab) | "I'll do this later →"

---

### Step 3 — Import your first deck

**Headline:** Import a deck to get started

**Body:**
> Paste a decklist in any standard format — plain text, Moxfield export, or an Archidekt URL. Fetchlist validates each card against Scryfall and builds your checklist instantly.

**Visual cue:** The import textarea with a small sample list visible

**CTA:** "Import a deck" (opens the import panel) | "Skip"

---

### Alternative: Single-page summary

If a multi-step flow feels too heavy, a single-panel summary is a valid alternative:

```
┌────────────────────────────────────────────────────────┐
│  👋 Welcome to Fetchlist                            [✕] │
├────────────────────────────────────────────────────────┤
│                                                        │
│  Fetchlist helps you track cards you need to acquire   │
│  for your MTG decks.                                   │
│                                                        │
│  ① Import a deck  →  tag each card as Owned,          │
│     Ordered, Proxy, or Need to Buy                     │
│                                                        │
│  ② Upload your Moxfield collection CSV  →             │
│     auto-tag every card you already own                │
│                                                        │
│  ③ Use the Buy list to shop for what's missing        │
│                                                        │
│         [Upload collection]   [Import a deck]          │
│                    [Skip for now]                      │
└────────────────────────────────────────────────────────┘
```

---

## 5. Design Decisions Needed

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| D1 | **Modal vs. inline panel vs. overlay** | Full-screen overlay, centered modal, slide-in from right, inline empty state card | Centered modal with backdrop — avoids blocking the import workflow behind it |
| D2 | **Single page vs. multi-step wizard** | 1 screen summary, 2–3 step wizard | Single page for MVP; feels less like a tutorial |
| D3 | **Illustration / visual** | None (text only), simple icon set, product screenshot mockups | Simple icon set or diagrammatic card row — screenshots go stale |
| D4 | **Skip vs. explicit CTA** | "Skip" link only, "Get started" primary CTA + "Skip" secondary | "Import a deck" primary + "Skip for now" link |
| D5 | **Mobile layout** | Same modal (scrollable), bottom sheet | Bottom sheet on mobile matches existing sheet patterns in the app |

---

## 6. Component Architecture (for reference)

Engineering will implement as a new component. No design decisions required here, but context for sizing the work:

```
src/
  features/
    onboarding/
      OnboardingModal.tsx    ← the modal itself
      OnboardingModal.css
```

**Props interface (draft):**
```typescript
interface OnboardingModalProps {
  onDismiss: () => void;
  onImportDeck: () => void;       // opens import panel
  onGoToCollection: () => void;   // switches to collection view
}
```

**Trigger in App.tsx:**
```typescript
const [onboardingDismissed, setOnboardingDismissed] = useLocalStorage(
  "fetchlist-onboarding-dismissed",
  false
);
const showOnboarding = state.decks.length === 0 && !onboardingDismissed;

// Render:
{showOnboarding && (
  <OnboardingModal
    onDismiss={() => setOnboardingDismissed(true)}
    onImportDeck={() => { setShowImport(true); setOnboardingDismissed(true); }}
    onGoToCollection={() => { setView("collection"); setOnboardingDismissed(true); }}
  />
)}
```

---

## 7. Existing Patterns to Reuse

| Pattern | Where it lives | Notes |
|---------|---------------|-------|
| Modal backdrop | `deck-picker-overlay` / `mobile-sheet-backdrop` in App.css | Same dark overlay |
| Bottom sheet | `.deck-picker-sheet` | Same slide-up animation on mobile |
| `.btn .btn-primary` / `.btn-ghost` | App.css | Use existing button styles |
| Source tag badge colors | `SOURCE_STYLES` in Checklist.tsx | Can screenshot/reference for illustrations |

---

## 8. Acceptance Criteria

- [ ] Modal appears on first load when the deck list is empty and onboarding has not been dismissed
- [ ] Modal does not appear on subsequent loads after dismissal
- [ ] All dismiss paths (✕, "Skip", primary CTA) persistently suppress the modal via localStorage
- [ ] "Import a deck" CTA opens the import panel and dismisses the modal
- [ ] "Upload collection" CTA navigates to the Collection tab and dismisses the modal
- [ ] Modal is fully usable on mobile (bottom sheet or scrollable modal, no overflow clipping)
- [ ] Modal does not block access to the app — the ✕ / skip is always reachable
- [ ] No onboarding shown when a returning user has existing decks (even if they clear their localStorage by accident — the trigger is deck count, not a separate "has visited" flag)

---

## 9. Out of Scope

- "Restore session" / "You've been here before" messaging
- Feature tooltips / coach marks for individual UI elements (separate initiative)
- Animated walkthrough / product tour (too heavy for v1)
- Help/docs link (no docs site yet)
