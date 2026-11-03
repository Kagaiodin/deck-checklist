/** Standardized deck formats. Values are stored lowercase (matches demo data and isCommanderFormat). */
export const DECK_FORMATS: { value: string; label: string }[] = [
  { value: "commander", label: "Commander" },
  { value: "duel commander", label: "Duel Commander" },
  { value: "brawl", label: "Brawl" },
  { value: "standard", label: "Standard" },
  { value: "pioneer", label: "Pioneer" },
  { value: "modern", label: "Modern" },
  { value: "legacy", label: "Legacy" },
  { value: "vintage", label: "Vintage" },
  { value: "pauper", label: "Pauper" },
  { value: "oathbreaker", label: "Oathbreaker" },
  { value: "limited", label: "Limited" },
  { value: "casual", label: "Casual" },
];

/** Options for a format <select>; keeps a legacy free-text value selectable so it isn't silently lost. */
export function formatOptions(current?: string): { value: string; label: string }[] {
  if (current && !DECK_FORMATS.some(f => f.value === current)) {
    return [...DECK_FORMATS, { value: current, label: current }];
  }
  return DECK_FORMATS;
}
