import { useTheme, type ThemeAccent } from "../hooks/useTheme";

const ACCENTS: { id: ThemeAccent; color: string; label: string }[] = [
  { id: "indigo",   color: "#6c5ce7", label: "Indigo"   },
  { id: "sapphire", color: "#3b82f6", label: "Sapphire" },
  { id: "emerald",  color: "#10b981", label: "Emerald"  },
  { id: "ember",    color: "#f59e0b", label: "Ember"    },
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
            style={{ background: a.color }}
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
