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
      const name = match[2].trim();
      result.push({ count, name });
    }
  }

  return result;
}
