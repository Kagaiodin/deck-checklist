import { useState, useEffect, useRef } from "react";
import type { ErrorQueueItem } from "../types/index";

interface Props {
  errors: ErrorQueueItem[];
  onRemap: (originalName: string, newName: string) => void;
  onDismiss: (originalName: string) => void;
}

export function ErrorQueue({ errors, onRemap, onDismiss }: Props) {
  const unresolved = errors.filter(e => !e.resolved);

  if (unresolved.length === 0) return null;

  return (
    <div className="error-queue">
      <h3 className="error-queue-title">Cards not found ({unresolved.length})</h3>
      <p className="error-queue-hint">
        These cards weren't recognised by Scryfall. Check the spelling or remap to a known card name.
      </p>
      <ul className="error-list">
        {unresolved.map(err => (
          <ErrorRow
            key={err.originalName}
            error={err}
            onRemap={onRemap}
            onDismiss={onDismiss}
          />
        ))}
      </ul>
    </div>
  );
}

async function fetchSuggestions(query: string): Promise<string[]> {
  if (query.length < 2) return [];
  const res = await fetch(
    `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query)}`
  );
  if (!res.ok) return [];
  const data = await res.json() as { data: string[] };
  return data.data;
}

function ErrorRow({
  error,
  onRemap,
  onDismiss
}: {
  error: ErrorQueueItem;
  onRemap: (originalName: string, newName: string) => void;
  onDismiss: (originalName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(error.searchName);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const results = await fetchSuggestions(value);
      setSuggestions(results);
      setHighlightedIndex(-1);
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value, editing]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSuggestions([]);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (value.trim()) {
      onRemap(error.originalName, value.trim());
      setEditing(false);
      setSuggestions([]);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      setValue(suggestions[highlightedIndex]);
      setSuggestions([]);
      setHighlightedIndex(-1);
    } else if (e.key === "Escape") {
      setSuggestions([]);
      setHighlightedIndex(-1);
    }
  }

  function selectSuggestion(name: string) {
    setValue(name);
    setSuggestions([]);
    setHighlightedIndex(-1);
  }

  return (
    <li className="error-row">
      {editing ? (
        <form className="remap-form" onSubmit={handleSubmit}>
          <div className="remap-autocomplete" ref={containerRef}>
            <input
              className="remap-input"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              autoComplete="off"
            />
            {suggestions.length > 0 && (
              <ul className="autocomplete-list">
                {suggestions.map((name, i) => (
                  <li
                    key={name}
                    className={`autocomplete-item${i === highlightedIndex ? " highlighted" : ""}`}
                    onMouseDown={() => selectSuggestion(name)}
                  >
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="submit" className="btn btn-primary btn-sm">Remap</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setSuggestions([]); }}>Cancel</button>
        </form>
      ) : (
        <>
          <span className="error-name">{error.originalName}</span>
          <div className="error-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Remap</button>
            <button className="btn btn-ghost btn-sm" onClick={() => onDismiss(error.originalName)}>Dismiss</button>
          </div>
        </>
      )}
    </li>
  );
}
