/** The Binder exclude list as read from storage or a Backup, which are untrusted: keep only string keys. */
export function sanitizeExcluded(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : [];
}
