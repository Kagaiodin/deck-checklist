import { useCallback, useMemo } from "react";
import type { Collection, Deck } from "../../../types/index";
import { useLocalStorage } from "../../../hooks/useLocalStorage";
import { useCommittedInfo } from "../../collection/hooks/useCommittedInfo";
import { deriveBinder, type Binder } from "./binderSurplus";

export const BINDER_EXCLUDED_KEY = "mtg-checklist-binder-excluded-v1";

/** Reads the exclude list straight from storage (Binder owns the live copy; backups need the current one). */
export function readBinderExcluded(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(BINDER_EXCLUDED_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : [];
  } catch { return []; }
}

export function writeBinderExcluded(list: string[]) {
  try { window.localStorage.setItem(BINDER_EXCLUDED_KEY, JSON.stringify(list)); } catch { /* quota */ }
}

/** Lowercase names the user keeps out of the Binder. */
export function useBinderExcluded() {
  const [list, setList] = useLocalStorage<string[]>(BINDER_EXCLUDED_KEY, []);
  const excluded = useMemo(() => new Set(Array.isArray(list) ? list : []), [list]);
  const exclude = useCallback((key: string) => setList(prev => (prev.includes(key) ? prev : [...prev, key])), [setList]);
  const restore = useCallback((key: string) => setList(prev => prev.filter(k => k !== key)), [setList]);
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
