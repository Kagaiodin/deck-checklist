export function parseDecklist(input: string): { count: number; name: string }[] {
  const lines = input.split('\n');
  const result: { count: number; name: string }[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('#')) {
      continue;
    }

    const match = /^(\d+)(?:x\s*)?(.+)/.exec(trimmedLine);
    if (match) {
      const count = parseInt(match[1], 10);
      let name = match[2].trim();

      // Strip Moxfield/MTGO export metadata from end of name:
      //   "(SET) COLLECTOR_NUM"       e.g. "(2XM) 309"
      //   "(SET) COLLECTOR_NUM *F*"   e.g. "(SLD) 2221 *F*" (foil)
      //   "(PLST) CON-31"             e.g. non-numeric collector numbers
      name = name.replace(/\s+\([A-Z0-9]{2,6}\)\s+[A-Za-z0-9/-]+(?:\s+\*F\*)?$/i, '').trim();

      // For double-faced / split cards keep only the front face name.
      // Moxfield uses " / ", standard decklists use " // " — handle both.
      //   "Bala Ged Recovery / Bala Ged Sanctuary" → "Bala Ged Recovery"
      //   "Fire // Ice"                             → "Fire"
      name = name.replace(/\s+\/\/?\/?\s+.+$/, '').trim();

      if (name) result.push({ count, name });
    }
  }

  return result;
}
