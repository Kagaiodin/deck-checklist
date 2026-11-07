import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Collection, Deck } from "../../../types/index";
import { useCommittedInfo } from "../../collection/hooks/useCommittedInfo";
import { deriveBinder, type Binder } from "./binderSurplus";
import { BINDER_EXCLUDED_KEY } from "../../../store/storageKeys";

const CHANGE_EVENT = "fetchlist:binder-excluded-change";

/** Backups are untrusted: keep only string keys. */
export function sanitizeExcluded(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : [];
}

/** Raw stored text (null if unset or storage is blocked). */
function readRaw(): string | null {
  try { return window.localStorage.getItem(BINDER_EXCLUDED_KEY); } catch { return null; }
}

/** Parses stored text into a clean list; anything unreadable is an empty list. */
function parseExcluded(raw: string | null): string[] {
  try { return sanitizeExcluded(JSON.parse(raw ?? "[]")); } catch { return []; }
}

/** Reads the exclude list straight from storage. */
export function readBinderExcluded(): string[] {
  return parseExcluded(readRaw());
}

/** Writes the list and tells every live reader (Binder, backups) to re-read it. */
export function writeBinderExcluded(list: string[]) {
  try { window.localStorage.setItem(BINDER_EXCLUDED_KEY, JSON.stringify(list)); } catch { /* quota */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(CHANGE_EVENT, cb); window.removeEventListener("storage", cb); };
}
function snapshot(): string {
  return readRaw() ?? "[]";
}

/** The current exclude list; one shared store, so every component sees the same list. */
export function useBinderExcludedList(): string[] {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "[]");
  return useMemo(() => parseExcluded(raw), [raw]);
}

/** Lowercase names the user keeps out of the Binder. */
export function useBinderExcluded() {
  const list = useBinderExcludedList();
  const excluded = useMemo(() => new Set(list), [list]);
  const exclude = useCallback((key: string) => {
    const cur = readBinderExcluded();
    if (!cur.includes(key)) writeBinderExcluded([...cur, key]);
  }, []);
  const restore = useCallback((key: string) => writeBinderExcluded(readBinderExcluded().filter(k => k !== key)), []);
  return { excluded, exclude, restore };
}

export function useBinder(collection: Collection, decks: Deck[]): Binder & {
  excluded: ReadonlySet<string>;
  exclude: (key: string) => void;
  restore: (key: string) => void;
} {
  const getCommittedInfo = useCommittedInfo(decks);
  const { excluded, exclude, restore } = useBinderExcluded();
  const binder = useMemo(() => deriveBinder(collection, getCommittedInfo, excluded), [collection, getCommittedInfo, excluded]);
  return { ...binder, excluded, exclude, restore };
}
