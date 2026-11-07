import { render } from "@testing-library/react";
import { onTestFinished, vi } from "vitest";
import App from "../App";
import { resetForTests } from "../store/collection";
import { ONBOARDING_DISMISSED_KEY } from "../store/storageKeys";
import { page } from "../utils/page";

/**
 * Renders the whole `<App />` over in-memory localStorage seeded with `storage`
 * (onboarding is dismissed unless the seed says otherwise). Resets the Collection store
 * so its first read sees the seed, and stubs the browser APIs jsdom lacks.
 * `reload` stubs the page reload a backup import ends in; `remount()` then plays the reload out,
 * rendering a fresh App over the same storage.
 * The stubs are removed when the test finishes. The URL is left alone: set it before calling.
 */
export function renderApp({ storage = {} }: { storage?: Record<string, string> } = {}) {
  const localStorageData = new Map<string, string>([[ONBOARDING_DISMISSED_KEY, "true"], ...Object.entries(storage)]);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => localStorageData.get(k) ?? null,
    setItem: (k: string, v: string) => void localStorageData.set(k, v),
    removeItem: (k: string) => void localStorageData.delete(k),
    clear: () => localStorageData.clear(),
  });
  // A fresh sessionStorage too, so an import's toast flash can't leak into the next test.
  const sessionData = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => sessionData.get(k) ?? null,
    setItem: (k: string, v: string) => void sessionData.set(k, v),
    removeItem: (k: string) => void sessionData.delete(k),
    clear: () => sessionData.clear(),
  });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }));
  vi.stubGlobal("scrollTo", vi.fn());
  const reload = vi.spyOn(page, "reload").mockImplementation(() => {});
  onTestFinished(() => { vi.unstubAllGlobals(); reload.mockRestore(); });
  resetForTests();

  /** The parsed JSON stored under `key`, or null. */
  const stored = (key: string) => JSON.parse(localStorageData.get(key) ?? "null");
  let rendered = render(<App />);
  function remount() {
    rendered.unmount();
    resetForTests();
    rendered = render(<App />);
  }
  return { ...rendered, stored, reload, remount };
}
