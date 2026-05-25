import { useState, useEffect } from "react";

export type ThemeMode   = "dark" | "light";
export type ThemeAccent = "indigo" | "sapphire" | "emerald" | "ember";

const MODE_KEY   = "fl-theme-mode";
const ACCENT_KEY = "fl-theme-accent";

function applyTheme(mode: ThemeMode, accent: ThemeAccent) {
  const el = document.documentElement;
  el.setAttribute("data-mode",   mode);
  el.setAttribute("data-accent", accent);
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem(MODE_KEY) as ThemeMode) ?? "dark";
  });
  const [accent, setAccentState] = useState<ThemeAccent>(() => {
    return (localStorage.getItem(ACCENT_KEY) as ThemeAccent) ?? "indigo";
  });

  // Apply on mount and whenever state changes
  useEffect(() => {
    applyTheme(mode, accent);
    localStorage.setItem(MODE_KEY, mode);
    localStorage.setItem(ACCENT_KEY, accent);
  }, [mode, accent]);

  const setMode    = (m: ThemeMode)   => setModeState(m);
  const setAccent  = (a: ThemeAccent) => setAccentState(a);
  const toggleMode = () => setMode(mode === "dark" ? "light" : "dark");

  return { mode, accent, setMode, setAccent, toggleMode };
}
