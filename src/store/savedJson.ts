// Loading and saving JSON in localStorage, with one rule for every owner of saved data (#207):
// missing, unreadable or `null` data gives the fallback, and a save that fails (storage full or
// blocked) leaves the change in memory only. Backup and demo mode keep their own parsing: backup
// must report unreadable data, and demo mode moves raw values between keys.
//
// The storageKeys scan reads `loadJson` / `saveJson` calls as reads / writes of their first
// argument, so pass the key as a string constant.

/**
 * Parses saved text. `read` checks or cleans the parsed value; if it throws, the fallback is used.
 * Without `read` the parsed value is trusted to be a `T`.
 */
export function parseJson<T>(raw: string | null, fallback: T, read?: (value: unknown) => T): T {
  if (!raw) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null) return fallback;
    return read ? read(value) : (value as T);
  } catch {
    return fallback;
  }
}

/** Loads a key's saved JSON (see `parseJson`). Blocked storage gives the fallback. */
export function loadJson<T>(key: string, fallback: T, read?: (value: unknown) => T): T {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return fallback;
  }
  return parseJson(raw, fallback, read);
}

/** Saves a value as JSON under a key. When storage is full or blocked, the change stays in memory only. */
export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage unavailable: keep working in memory.
  }
}
