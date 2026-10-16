import { useState, useEffect, useRef } from "react";
import { useTheme, type ThemeAccent, type ThemeMode } from "../hooks/useTheme";

const ACCENTS: { id: ThemeAccent; darkColor: string; lightColor: string; label: string }[] = [
  { id: "indigo",   darkColor: "#6c5ce7", lightColor: "#4f46e5", label: "Indigo"   },
  { id: "sapphire", darkColor: "#3b82f6", lightColor: "#2563eb", label: "Sapphire" },
  { id: "emerald",  darkColor: "#10b981", lightColor: "#059669", label: "Emerald"  },
  { id: "ember",    darkColor: "#f59e0b", lightColor: "#b45309", label: "Ember"    },
];

const MODES: { id: ThemeMode; label: string; icon: string }[] = [
  { id: "dark",  label: "Dark",  icon: "☾" },
  { id: "light", label: "Light", icon: "☀" },
];

export function ThemeToggle() {
  const { mode, accent, setMode, setAccent } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open]);

  return (
    <div className="settings-container" ref={containerRef}>
      <button
        className={`settings-btn${open ? " open" : ""}`}
        onClick={() => setOpen(o => !o)}
        aria-label="Appearance settings"
        aria-expanded={open}
        title="Appearance settings"
      >
        {/* Palette icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 1.5C4.41 1.5 1.5 4.41 1.5 8c0 3.31 2.69 6 6 6 .55 0 1-.45 1-1 0-.27-.11-.51-.27-.68-.16-.17-.27-.41-.27-.68 0-.55.45-1 1-1h1.17c1.86 0 3.37-1.51 3.37-3.37C13.5 4.14 11.04 1.5 8 1.5z"
            stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
          />
          <circle cx="5.5" cy="6.5" r="1"   fill="currentColor" />
          <circle cx="8"   cy="4.5" r="1"   fill="currentColor" />
          <circle cx="10.5" cy="6.5" r="1"  fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div className="settings-popover" role="dialog" aria-label="Appearance settings">
          {/* Mode segment */}
          <div className="settings-popover-label">Mode</div>
          <div className="mode-segment" role="radiogroup" aria-label="Color mode">
            {MODES.map(m => (
              <button
                key={m.id}
                className={`mode-segment-btn${mode === m.id ? " active" : ""}`}
                onClick={() => setMode(m.id)}
                role="radio"
                aria-checked={mode === m.id}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>

          <div className="settings-divider" />

          {/* Accent swatches */}
          <div className="settings-popover-label">Accent</div>
          <div className="accent-swatches" role="radiogroup" aria-label="Accent color">
            {ACCENTS.map(a => (
              <button
                key={a.id}
                className="accent-swatch"
                style={{
                  background: mode === "light" ? a.lightColor : a.darkColor,
                  color:      mode === "light" ? a.lightColor : a.darkColor,
                }}
                data-active={accent === a.id ? "true" : "false"}
                onClick={() => setAccent(a.id)}
                role="radio"
                aria-checked={accent === a.id}
                aria-label={a.label}
                title={a.label}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
