/** True when a free-text deck format means Commander ("Commander", "EDH", "cmdr", "Duel Commander"). */
export function isCommanderFormat(format?: string): boolean {
  if (!format) return false;
  return /\b(commander|edh|cmdr)\b/i.test(format);
}
