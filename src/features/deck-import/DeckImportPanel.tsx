import { useState } from "react";
import type { Card, ErrorQueueItem } from "../../types/index";
import type { ValidationProgress } from "../../utils/validator";
import { formatOptions } from "../../utils/deckFormats";
import { ProgressTracker } from "../../components/ProgressTracker";
import { collectionStore } from "../../store/collection";
import { importDecklist, archidektDeckId, fetchArchidektDecklist } from "./deckImport";

/** A Deck import that succeeded: the deck to create and its Deck errors. */
export interface ImportedDeck {
  name: string;
  url?: string;
  format?: string;
  built: boolean;
  cards: Card[];
  errors: ErrorQueueItem[];
}

interface Props {
  onImported: (deck: ImportedDeck) => void;
  onCancel: () => void;
}

/** The Import Decklist panel: paste, upload or fetch a Decklist, then look it up and hand back a deck. */
export function DeckImportPanel({ onImported, onCancel }: Props) {
  const [importText, setImportText] = useState("");
  const [deckName, setDeckName] = useState("");
  const [deckUrl, setDeckUrl] = useState("");
  const [deckFormat, setDeckFormat] = useState("");
  const [importAsBuilt, setImportAsBuilt] = useState(false);
  const [validating, setValidating] = useState(false);
  const [progress, setProgress] = useState<ValidationProgress>({ total: 0, validated: 0 });
  const [importError, setImportError] = useState<string | null>(null);
  const [showFormats, setShowFormats] = useState(false);
  const [archidektFetching, setArchidektFetching] = useState(false);
  const [archidektError, setArchidektError] = useState<string | null>(null);

  async function handleImport() {
    if (!importText.trim()) return;
    setImportError(null);
    setValidating(true);
    setProgress({ total: 0, validated: 0 });
    try {
      const { cards, errors } = await importDecklist(importText, { collection: collectionStore.get, onProgress: setProgress });
      onImported({
        name: deckName.trim(),
        url: deckUrl.trim() || undefined,
        format: deckFormat.trim() || undefined,
        built: importAsBuilt,
        cards,
        errors,
      });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Validation failed. Please try again.");
    } finally {
      setValidating(false);
    }
  }

  async function fetchFromArchidekt() {
    const deckId = archidektDeckId(deckUrl);
    if (!deckId) return;
    setArchidektFetching(true);
    setArchidektError(null);
    try {
      const { decklist, name } = await fetchArchidektDecklist(deckId);
      setImportText(decklist);
      setDeckName(prev => (prev.trim() ? prev : name));
    } catch (e) {
      setArchidektError(e instanceof Error ? e.message : "Failed to fetch from Archidekt.");
    } finally {
      setArchidektFetching(false);
    }
  }

  return (
    <section className="import-panel">
      <div className="import-panel-header">
        <h2>Import Decklist</h2>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>✕ Cancel</button>
      </div>
      <div className="import-formats">
        <button className="import-formats-toggle" onClick={() => setShowFormats(v => !v)}>
          {showFormats ? "▾" : "▸"} Supported formats
        </button>
        {showFormats && (
          <div className="import-formats-body">
            <div className="import-format-row">
              <span className="import-format-label">Plain decklist</span>
              <code>4 Lightning Bolt</code>
            </div>
            <div className="import-format-row">
              <span className="import-format-label">Moxfield export</span>
              <code>1 Sol Ring (SLD) 912 *F*</code>
              <span className="import-format-note">Set codes & foil markers stripped automatically</span>
            </div>
            <div className="import-format-row">
              <span className="import-format-label">Double-faced cards</span>
              <code>1 Bala Ged Recovery / Bala Ged Sanctuary (ZNR) 180</code>
              <span className="import-format-note">Back face stripped, front face used</span>
            </div>
            <div className="import-format-row">
              <span className="import-format-label">Archidekt URL</span>
              <code>archidekt.com/decks/365563/…</code>
              <span className="import-format-note">Paste URL above → click Fetch to auto-import</span>
            </div>
            <div className="import-format-row">
              <span className="import-format-label">.txt file</span>
              <span className="import-format-note">Any of the above formats, one card per line</span>
            </div>
          </div>
        )}
      </div>
      <div className="import-name-row">
        <input
          className="deck-name-input"
          placeholder="Deck name (optional)"
          value={deckName}
          onChange={e => setDeckName(e.target.value)}
          disabled={validating}
        />
        <select
          className="deck-name-input deck-format-input"
          aria-label="Deck format"
          value={deckFormat}
          onChange={e => setDeckFormat(e.target.value)}
          disabled={validating}
        >
          <option value="">Format (optional)</option>
          {formatOptions().map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>
      <div className="url-field-row">
        <input
          className="deck-name-input"
          placeholder="Deck URL (optional) — paste an Archidekt URL to auto-import"
          value={deckUrl}
          onChange={e => { setDeckUrl(e.target.value); setArchidektError(null); }}
          disabled={validating || archidektFetching}
        />
        {archidektDeckId(deckUrl) && (
          <button
            className="btn btn-primary btn-sm archidekt-fetch-btn"
            onClick={fetchFromArchidekt}
            disabled={archidektFetching || validating}
          >
            {archidektFetching ? "Fetching…" : "Fetch from Archidekt"}
          </button>
        )}
      </div>
      {archidektError && <p className="import-error">{archidektError}</p>}
      <label className="import-built-row">
        <input
          type="checkbox"
          checked={importAsBuilt}
          onChange={e => setImportAsBuilt(e.target.checked)}
          disabled={validating}
        />
        This deck is already built
      </label>
      <label className="file-upload-label">
        <input
          type="file"
          accept=".txt"
          className="file-upload-input"
          disabled={validating}
          onChange={e => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (!deckName) setDeckName(file.name.replace(/\.[^.]+$/, ""));
            const reader = new FileReader();
            reader.onload = ev => setImportText(ev.target?.result as string ?? "");
            reader.readAsText(file);
            e.target.value = "";
          }}
        />
        Upload .txt file
      </label>
      <textarea
        className="import-textarea"
        placeholder={"4 Lightning Bolt\n2 Snapcaster Mage\n1 Black Lotus"}
        value={importText}
        onChange={e => setImportText(e.target.value)}
        disabled={validating}
        rows={typeof window !== "undefined" && window.innerWidth < 640 ? 8 : 16}
      />
      {importError && <p className="import-error">{importError}</p>}
      {validating && <ProgressTracker progress={progress} />}
      {!importText.trim() && !validating && (
        <p className="import-hint">Paste a decklist to enable import.</p>
      )}
      <button
        className="btn btn-primary"
        onClick={handleImport}
        disabled={validating || !importText.trim()}
      >
        {validating ? "Validating…" : "Import & Validate"}
      </button>
    </section>
  );
}
