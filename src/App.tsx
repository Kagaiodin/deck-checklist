import { useState, useEffect } from "react";
import "./App.css";
import { DeckProvider, useDecks } from "./store/decks";
import { parseDecklist } from "./utils/parser";
import { validateDecklist } from "./utils/validator";
import type { ValidationProgress } from "./utils/validator";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { Checklist } from "./components/Checklist";
import { ErrorQueue } from "./components/ErrorQueue";
import { ProgressTracker } from "./components/ProgressTracker";
import type { Deck, ErrorQueueItem, AcquisitionSource } from "./types/index";

function AppInner() {
  const { state, dispatch } = useDecks();
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [deckName, setDeckName] = useState("");
  const [deckUrl, setDeckUrl] = useState("");
  const [allErrors, setAllErrors] = useLocalStorage<Record<string, ErrorQueueItem[]>>("mtg-checklist-errors", {});
  const [validating, setValidating] = useState(false);
  const [progress, setProgress] = useState<ValidationProgress>({ total: 0, validated: 0 });
  const [importError, setImportError] = useState<string | null>(null);
  const [view, setView] = useState<"import" | "decks">("decks");
  const [renamingDeckId, setRenamingDeckId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const activeDeck = state.decks.find(d => d.id === activeDeckId) ?? null;
  const errors = activeDeckId ? (allErrors[activeDeckId] ?? []) : [];

  function setErrors(updater: ErrorQueueItem[] | ((prev: ErrorQueueItem[]) => ErrorQueueItem[])) {
    if (!activeDeckId) return;
    setAllErrors(prev => ({
      ...prev,
      [activeDeckId]: typeof updater === "function" ? updater(prev[activeDeckId] ?? []) : updater
    }));
  }

  async function handleImport() {
    if (!importText.trim()) return;
    setImportError(null);
    setValidating(true);
    setProgress({ total: 0, validated: 0 });

    try {
      const parsed = parseDecklist(importText);
      if (parsed.length === 0) {
        setImportError("No valid card lines found. Use the format: 4 Lightning Bolt");
        setValidating(false);
        return;
      }

      const result = await validateDecklist(parsed, p => setProgress(p));

      const id = crypto.randomUUID();
      const name = deckName.trim() || `Deck ${state.decks.length + 1}`;
      const deck: Deck = {
        id,
        name,
        url: deckUrl.trim() || undefined,
        cards: result.cards,
        createdAt: Date.now()
      };

      dispatch({ type: "ADD_DECK", payload: deck });
      setAllErrors(prev => ({ ...prev, [id]: result.errors }));
      setActiveDeckId(id);
      setImportText("");
      setDeckName("");
      setDeckUrl("");
      setView("decks");
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Validation failed. Please try again.");
    } finally {
      setValidating(false);
    }
  }

  function handleToggleAcquired(cardId: string) {
    if (!activeDeckId) return;
    dispatch({ type: "TOGGLE_ACQUIRED", payload: { deckId: activeDeckId, cardId } });
  }

  function handleSetSource(cardId: string, source: AcquisitionSource | undefined) {
    if (!activeDeckId) return;
    dispatch({ type: "SET_CARD_SOURCE", payload: { deckId: activeDeckId, cardId, source } });
  }

  function handleBulkSetSource(cardIds: string[], source: AcquisitionSource | undefined) {
    if (!activeDeckId) return;
    dispatch({ type: "BULK_SET_SOURCE", payload: { deckId: activeDeckId, cardIds, source } });
  }

  async function handleRemap(originalName: string, newName: string) {
    if (!activeDeckId) return;
    try {
      const result = await validateDecklist([{ count: 1, name: newName }]);
      if (result.cards.length > 0) {
        const remapped = result.cards[0];
        const currentDeck = state.decks.find(d => d.id === activeDeckId);
        if (currentDeck) {
          dispatch({
            type: "SET_CARDS",
            payload: { deckId: activeDeckId, cards: [...currentDeck.cards, remapped] }
          });
        }
        setErrors(prev =>
          prev.map(e => e.originalName === originalName ? { ...e, searchName: newName, resolved: true } : e)
        );
      } else {
        setErrors(prev =>
          prev.map(e => e.originalName === originalName ? { ...e, searchName: newName } : e)
        );
      }
    } catch {
      // leave the error in queue if the remap lookup fails
    }
  }

  function handleDismiss(originalName: string) {
    setErrors(prev =>
      prev.map(e => e.originalName === originalName ? { ...e, resolved: true } : e)
    );
  }

  function handleDeleteDeck(id: string) {
    dispatch({ type: "DELETE_DECK", payload: id });
    setAllErrors(prev => { const next = { ...prev }; delete next[id]; return next; });
    if (activeDeckId === id) setActiveDeckId(null);
  }

  function startRename(deck: Deck) {
    setRenamingDeckId(deck.id);
    setRenameValue(deck.name);
  }

  function commitRename() {
    if (renamingDeckId && renameValue.trim()) {
      dispatch({ type: "RENAME_DECK", payload: { id: renamingDeckId, name: renameValue.trim() } });
    }
    setRenamingDeckId(null);
  }

  function handleExportMissing() {
    if (!activeDeck) return;
    const missing = activeDeck.cards
      .filter(c => !c.acquired)
      .map(c => `${c.quantity} ${c.inputName ?? c.name}`)
      .join("\n");
    const blob = new Blob([missing], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeDeck.name} - missing.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function buildProxyList(): string {
    if (!activeDeck) return "";
    return activeDeck.cards
      .filter(c => c.source === "proxy")
      .map(c => `${c.quantity}x ${c.inputName ?? c.name}`)
      .join("\n");
  }

  function handleProxyDownload() {
    if (!activeDeck) return;
    const text = buildProxyList();
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeDeck.name} - proxies.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleProxyCopy() {
    const text = buildProxyList();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const [copied, setCopied] = useState(false);
  const proxyCards = activeDeck?.cards.filter(c => c.source === "proxy") ?? [];

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">MTG Checklist</h1>
        <nav className="app-nav">
          <button
            className={`nav-btn${view === "decks" ? " active" : ""}`}
            onClick={() => setView("decks")}
          >
            My Decks
          </button>
          <button
            className={`nav-btn${view === "import" ? " active" : ""}`}
            onClick={() => setView("import")}
          >
            + Import Deck
          </button>
        </nav>
      </header>

      <main className="app-main">
        {view === "import" && (
          <section className="import-panel">
            <h2>Import Decklist</h2>
            <p className="import-hint">Paste your decklist below or upload a file. One card per line: <code>4 Lightning Bolt</code></p>
            <input
              className="deck-name-input"
              placeholder="Deck name (optional)"
              value={deckName}
              onChange={e => setDeckName(e.target.value)}
              disabled={validating}
            />
            <input
              className="deck-name-input"
              placeholder="Deck URL (optional) — e.g. moxfield.com/decks/..."
              value={deckUrl}
              onChange={e => setDeckUrl(e.target.value)}
              disabled={validating}
            />
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
              rows={16}
            />
            {importError && <p className="import-error">{importError}</p>}
            {validating && <ProgressTracker progress={progress} />}
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={validating || !importText.trim()}
            >
              {validating ? "Validating…" : "Import & Validate"}
            </button>
          </section>
        )}

        {view === "decks" && (
          <div className="decks-layout">
            <aside className="deck-sidebar">
              <h2>Decks</h2>
              {state.decks.length === 0 ? (
                <p className="empty-state">No decks yet. Import one to get started.</p>
              ) : (
                <ul className="deck-list">
                  {state.decks.map(deck => {
                    const acquiredCards = deck.cards.filter(c => c.acquired).reduce((s, c) => s + c.quantity, 0);
                    const totalCards = deck.cards.reduce((s, c) => s + c.quantity, 0);
                    return (
                      <li
                        key={deck.id}
                        className={`deck-item${activeDeckId === deck.id ? " active" : ""}`}
                        onClick={() => setActiveDeckId(deck.id)}
                      >
                        <span className="deck-item-name">{deck.name}</span>
                        <span className="deck-item-progress">{acquiredCards}/{totalCards}</span>
                        <button
                          className="deck-delete-btn"
                          onClick={e => { e.stopPropagation(); handleDeleteDeck(deck.id); }}
                          title="Delete deck"
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>

            <div className="deck-content">
              {activeDeck ? (
                <>
                  <div className="deck-content-header">
                    {renamingDeckId === activeDeck.id ? (
                      <form className="rename-form" onSubmit={e => { e.preventDefault(); commitRename(); }}>
                        <input
                          className="rename-input"
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={commitRename}
                          autoFocus
                        />
                        <button type="submit" className="btn btn-primary btn-sm">Save</button>
                      </form>
                    ) : (
                      <h2 className="deck-content-title" onClick={() => startRename(activeDeck)}>
                        {activeDeck.name}
                        <span className="rename-hint">✎</span>
                      </h2>
                    )}
                    <div className="deck-header-actions">
                      {activeDeck.url && (
                        <a
                          href={activeDeck.url.startsWith("http") ? activeDeck.url : `https://${activeDeck.url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary btn-sm"
                        >
                          View deck ↗
                        </a>
                      )}
                      <button className="btn btn-secondary btn-sm" onClick={handleExportMissing}>
                        Export missing
                      </button>
                    </div>
                  </div>
                  {proxyCards.length > 0 && (
                    <div className="proxy-export-bar">
                      <span className="proxy-export-label">
                        🖨 {proxyCards.reduce((s, c) => s + c.quantity, 0)} proxy card{proxyCards.reduce((s, c) => s + c.quantity, 0) !== 1 ? "s" : ""} — export for{" "}
                        <a href="https://proxxied.com" target="_blank" rel="noopener noreferrer" className="proxy-export-link">proxxied.com</a>
                      </span>
                      <div className="proxy-export-actions">
                        <button className="btn btn-secondary btn-sm" onClick={handleProxyCopy}>
                          {copied ? "✓ Copied!" : "Copy to clipboard"}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={handleProxyDownload}>
                          Download .txt
                        </button>
                      </div>
                    </div>
                  )}
                  <ErrorQueue
                    errors={errors}
                    onRemap={handleRemap}
                    onDismiss={handleDismiss}
                  />
                  <Checklist
                    deck={activeDeck}
                    onToggleAcquired={handleToggleAcquired}
                    onSetSource={handleSetSource}
                    onBulkSetSource={handleBulkSetSource}
                  />
                </>
              ) : (
                <div className="empty-state centered">
                  <p>Select a deck from the sidebar, or import a new one.</p>
                  <button className="btn btn-primary" onClick={() => setView("import")}>
                    Import Deck
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function PersistenceWrapper({ children }: { children: (decks: Deck[]) => React.ReactNode }) {
  const [savedDecks] = useLocalStorage<Deck[]>("mtg-checklist-decks", []);
  return <>{children(savedDecks)}</>;
}

function PersistenceSync() {
  const { state } = useDecks();
  const [, setSavedDecks] = useLocalStorage<Deck[]>("mtg-checklist-decks", []);

  useEffect(() => {
    setSavedDecks(state.decks);
  }, [state.decks, setSavedDecks]);

  return null;
}

export default function App() {
  return (
    <PersistenceWrapper>
      {initialDecks => (
        <DeckProvider initialDecks={initialDecks}>
          <PersistenceSync />
          <AppInner />
        </DeckProvider>
      )}
    </PersistenceWrapper>
  );
}
