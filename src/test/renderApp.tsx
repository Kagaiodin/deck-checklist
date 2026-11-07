import { render } from "@testing-library/react";
import { vi } from "vitest";
import App from "../App";
import { resetForTests } from "../store/collection";

const ONBOARDING_DISMISSED_KEY = "fetchlist:onboarding:dismissed";

/**
 * Renders the whole `<App />` over in-memory localStorage seeded with `storage`
 * (onboarding is dismissed unless the seed says otherwise). Resets the Collection store
 * so its first read sees the seed, and stubs the browser APIs jsdom lacks.
 * The URL is left alone: set it before calling. Pair with `afterEach(() => vi.unstubAllGlobals())`.
 */
export function renderApp({ storage = {} }: { storage?: Record<string, string> } = {}) {
  const store = new Map<string, string>([[ONBOARDING_DISMISSED_KEY, "true"], ...Object.entries(storage)]);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }));
  vi.stubGlobal("scrollTo", vi.fn());
  resetForTests();

  /** The parsed JSON stored under `key`, or null. */
  const stored = (key: string) => JSON.parse(store.get(key) ?? "null");
  return { ...render(<App />), store, stored };
}
