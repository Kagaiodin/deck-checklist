import { useState, useEffect } from "react";
import { THEME_MODE_KEY, THEME_ACCENT_KEY } from "../store/storageKeys";

const MODES = ["dark", "light"] as const;
const ACCENTS = ["indigo", "sapphire", "emerald", "ember"] as const;

export type ThemeMode   = typeof MODES[number];
export type ThemeAccent = typeof ACCENTS[number];

function applyTheme(mode: ThemeMode, accent: ThemeAccent) {
  const el = document.documentElement;
  el.setAttribute("data-mode",   mode);
  el.setAttribute("data-accent", accent);
}

/**
 * The saved value if it's one of `allowed`; blocked storage, nothing saved or an unknown value gives the fallback.
 * `read` does the getItem so each call names its key (the storageKeys scan needs that).
 */
function loadPreference<T extends string>(read: () => string | null, allowed: readonly T[], fallback: T): T {
  let saved: string | null;
  try { saved = read(); } catch { return fallback; }
  return allowed.find(value => value === saved) ?? fallback;
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(
    () => loadPreference(() => localStorage.getItem(THEME_MODE_KEY), MODES, "dark"),
  );
  const [accent, setAccentState] = useState<ThemeAccent>(
    () => loadPreference(() => localStorage.getItem(THEME_ACCENT_KEY), ACCENTS, "indigo"),
  );

  // Apply on mount and whenever state changes
  useEffect(() => {
    applyTheme(mode, accent);
    try {
      localStorage.setItem(THEME_MODE_KEY, mode);
      localStorage.setItem(THEME_ACCENT_KEY, accent);
    } catch { /* storage unavailable: choice kept in memory */ }
  }, [mode, accent]);

  const setMode    = (m: ThemeMode)   => setModeState(m);
  const setAccent  = (a: ThemeAccent) => setAccentState(a);
  const toggleMode = () => setMode(mode === "dark" ? "light" : "dark");

  return { mode, accent, setMode, setAccent, toggleMode };
}
