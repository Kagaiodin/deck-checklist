import { useTheme, type ThemeAccent } from "../hooks/useTheme";

const ACCENTS: { id: ThemeAccent; darkColor: string; lightColor: string; label: string }[] = [
  { id: "indigo",   darkColor: "#6c5ce7", lightColor: "#4f46e5", label: "Indigo"   },
  { id: "sapphire", darkColor: "#3b82f6", lightColor: "#2563eb", label: "Sapphire" },
  { id: "emerald",  darkColor: "#10b981", lightColor: "#059669", label: "Emerald"  },
  { id: "ember",    darkColor: "#f59e0b", lightColor: "#b45309", label: "Ember"    },
];

export function ThemeToggle() {
  const { mode, accent, toggleMode, setAccent } = useTheme();

  return (
    <div className="theme-toggle" aria-label="Theme settings">
      <button
        className="theme-mode-btn"
        onClick={toggleMode}
        title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        aria-pressed={mode === "light"}
      >
        {mode === "dark" ? "☀" : "◑"}
      </button>

      <div className="theme-accents" role="radiogroup" aria-label="Accent color">
        {ACCENTS.map(a => (
          <button
            key={a.id}
            className={`theme-accent-dot${accent === a.id ? " active" : ""}`}
            style={{ background: mode === "light" ? a.lightColor : a.darkColor }}
            onClick={() => setAccent(a.id)}
            role="radio"
            aria-checked={accent === a.id}
            aria-label={a.label}
            title={a.label}
          />
        ))}
      </div>
    </div>
  );
}
