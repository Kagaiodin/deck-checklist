import { useState, useEffect, useRef } from "react";
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
  const [sidebarOpen, setSidebarOpen] = useState(true);

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

  function handleRemoveCard(cardId: string) {
    if (!activeDeckId) return;
    dispatch({ type: "REMOVE_CARD", payload: { deckId: activeDeckId, cardId } });
  }

  function handleUpdateQuantity(cardId: string, quantity: number) {
    if (!activeDeckId) return;
    dispatch({ type: "UPDATE_CARD_QUANTITY", payload: { deckId: activeDeckId, cardId, quantity } });
  }

  async function handleAddCard(line: string): Promise<{ success: boolean; error?: string }> {
    if (!activeDeckId) return { success: false, error: "No deck selected." };
    try {
      const parsed = parseDecklist(line);
      if (parsed.length === 0) return { success: false, error: "Invalid card format." };
      const result = await validateDecklist(parsed);
      if (result.cards.length > 0) {
        dispatch({ type: "ADD_CARD", payload: { deckId: activeDeckId, card: result.cards[0] } });
        return { success: true };
      }
      return { success: false, error: `"${parsed[0].name}" not found on Scryfall.` };
    } catch {
      return { success: false, error: "Validation failed. Please try again." };
    }
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
  const proxyTotal = proxyCards.reduce((s, c) => s + c.quantity, 0);

  // ── Buy links ──────────────────────────────────────────────────────────────
  // Manapool supports ?deck=base64list for direct prefill (no paste needed).
  // TCGPlayer and Card Kingdom require manual paste, so we copy to clipboard.
  const VENDORS = [
    { label: "Manapool",     url: "https://manapool.com/add-deck",       prefill: true  },
    { label: "TCGPlayer",    url: "https://www.tcgplayer.com/massentry", prefill: false },
    { label: "Card Kingdom", url: "https://www.cardkingdom.com/builder", prefill: false },
  ];
  const [sentVendor, setSentVendor] = useState<string | null>(null);
  const toBuyCards = activeDeck?.cards.filter(c => c.source === "need_to_buy") ?? [];
  const toBuyTotal = toBuyCards.reduce((s, c) => s + c.quantity, 0);

  async function handleSendToVendor(idx: number) {
    const list = toBuyCards.map(c => `${c.quantity} ${c.name}`).join("\n");
    const vendor = VENDORS[idx];
    if (vendor.prefill) {
      const encoded = btoa(unescape(encodeURIComponent(list)));
      window.open(`${vendor.url}?deck=${encoded}`, "_blank");
    } else {
      await navigator.clipboard.writeText(list);
      window.open(vendor.url, "_blank");
    }
    setSentVendor(vendor.label);
    setTimeout(() => setSentVendor(null), 2500);
  }

  // ── Actions menu ───────────────────────────────────────────────────────────
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!actionsOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setActionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [actionsOpen]);

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">
          <img src="/banner_temp_new.png" alt="Fetchlist" className="app-logo" />
        </h1>
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
            <aside className={`deck-sidebar${sidebarOpen ? "" : " sidebar-collapsed"}`}>
              <div className="sidebar-header">
                <h2>Decks</h2>
                <button
                  className="sidebar-toggle"
                  onClick={() => setSidebarOpen(o => !o)}
                  aria-label={sidebarOpen ? "Hide deck list" : "Show deck list"}
                >
                  {sidebarOpen ? "▲ Hide" : "▼ Show"}
                </button>
              </div>
              {sidebarOpen && (
                state.decks.length === 0 ? (
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
                          onClick={() => { setActiveDeckId(deck.id); if (window.innerWidth < 768) setSidebarOpen(false); }}
                        >
                          <div className="deck-item-info">
                            <div className="deck-item-top">
                              <span className="deck-item-name">{deck.name}</span>
                              <span className="deck-item-progress">{acquiredCards}/{totalCards}</span>
                            </div>
                            <div className="deck-item-bar-track">
                              <div
                                className="deck-item-bar-fill"
                                style={{
                                  width: totalCards > 0 ? `${(acquiredCards / totalCards) * 100}%` : "0%",
                                  backgroundPosition: totalCards > 0 ? `${100 - (acquiredCards / totalCards) * 100}% center` : "100% center"
                                }}
                              />
                            </div>
                          </div>
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
                )
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
                      <div className="actions-menu-container" ref={actionsMenuRef}>
                        <button
                          className={`btn btn-secondary btn-sm${actionsOpen ? " active" : ""}`}
                          onClick={() => setActionsOpen(o => !o)}
                        >
                          Actions ▾
                        </button>
                        {actionsOpen && (
                          <div className="actions-dropdown">
                            {/* Export missing */}
                            <div className="actions-section-label">Missing cards</div>
                            <button className="actions-item" onClick={() => { handleExportMissing(); setActionsOpen(false); }}>
                              Export missing list
                            </button>

                            {/* Proxy export */}
                            {proxyCards.length > 0 && (
                              <>
                                <div className="actions-divider" />
                                <div className="actions-section-label">🖨 {proxyTotal} proxy card{proxyTotal !== 1 ? "s" : ""}</div>
                                <button className="actions-item" onClick={handleProxyCopy}>
                                  {copied ? "✓ Copied!" : "Copy proxy list"}
                                  <span className="actions-item-hint">for proxxied.com</span>
                                </button>
                                <button className="actions-item" onClick={() => { handleProxyDownload(); setActionsOpen(false); }}>
                                  Download .txt
                                </button>
                              </>
                            )}

                            {/* Send to vendor */}
                            {toBuyCards.length > 0 && (
                              <>
                                <div className="actions-divider" />
                                <div className="actions-section-label">🛒 {toBuyTotal} card{toBuyTotal !== 1 ? "s" : ""} to buy</div>
                                {VENDORS.map((v, i) => (
                                  <button key={v.label} className="actions-item" onClick={() => handleSendToVendor(i)}>
                                    {sentVendor === v.label ? "✓ Done!" : `Send to ${v.label}`}
                                    <span className="actions-item-hint">{v.prefill ? "Opens pre-filled" : "Paste when tab opens"}</span>
                                  </button>
                                ))}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
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
                    onRemoveCard={handleRemoveCard}
                    onUpdateQuantity={handleUpdateQuantity}
                    onAddCard={handleAddCard}
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
