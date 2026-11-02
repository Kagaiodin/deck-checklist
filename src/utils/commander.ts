/** True when a free-text deck format means Commander ("Commander", "EDH", "cmdr", "Duel Commander"). */
export function isCommanderFormat(format?: string): boolean {
  if (!format) return false;
  return /\b(commander|edh|cmdr)\b/i.test(format);
}

/** Toast title for setting/removing a commander, using the short name ("Selvala, Heart of the Wilds" -> "Selvala"). */
export function commanderToastTitle(cardName: string, wasCommander: boolean): string {
  const short = cardName.split(",")[0];
  return `${short} ${wasCommander ? "removed as" : "set as"} commander`;
}
