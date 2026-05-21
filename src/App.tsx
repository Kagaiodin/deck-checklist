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
import type { Deck, ErrorQueueItem, AcquisitionSource, Collection, CollectionMeta } from "./types/index";
import { parseCollectionCSV, applyCollectionToCards } from "./utils/csvParser";

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
  const [view, setView] = useState<"decks" | "collection">("decks");
  const [showImport, setShowImport] = useState(false);
  const [renamingDeckId, setRenamingDeckId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [archidektFetching, setArchidektFetching] = useState(false);
  const [archidektError, setArchidektError] = useState<string | null>(null);
  const [showFormats, setShowFormats] = useState(false);
  const [deckPickerOpen, setDeckPickerOpen] = useState(false);

  // ── Collection state ───────────────────────────────────────────────────────
  const [collection, setCollection] = useLocalStorage<Collection>("mtg-checklist-collection-v2", {});
  const [collectionMeta, setCollectionMeta] = useLocalStorage<CollectionMeta | null>("mtg-checklist-collection-meta-v2", null);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [collectionSearch, setCollectionSearch] = useState("");
  const [collectionSort, setCollectionSort] = useState<"name-asc" | "name-desc" | "qty-desc" | "qty-asc">("name-asc");
  const [collectionPage, setCollectionPage] = useState(0);
  const [expandedCollectionKey, setExpandedCollectionKey] = useState<string | null>(null);
  const [scrollToCollectionKey, setScrollToCollectionKey] = useState<string | null>(null);
  const collectionListRef = useRef<HTMLUListElement>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditText, setBulkEditText] = useState("");
  const [bulkEditMode, setBulkEditMode] = useState<"merge" | "replace">("merge");
  const [bulkEditError, setBulkEditError] = useState<string | null>(null);
  const [clearConfirming, setClearConfirming] = useState(false);
  const [pendingCsvFile, setPendingCsvFile] = useState<File | null>(null);
  const csvReplaceInputRef = useRef<HTMLInputElement>(null);
  const [editingPrinting, setEditingPrinting] = useState<{
    key: string; idx: number; qty: string; set: string; cn: string; foil: boolean;
  } | null>(null);

  const COLLECTION_PAGE_SIZE = 100;

  const collectionFiltered = Object.entries(collection)
    .filter(([name]) => name.includes(collectionSearch.toLowerCase()))
    .map(([name, rawPrintings]) => {
      // Guard against stale localStorage data in old flat number format
      const printings = Array.isArray(rawPrintings) ? rawPrintings : [];
      return { name, printings, total: printings.reduce((s, p) => s + p.quantity, 0) };
    })
    .sort((a, b) => {
      if (collectionSort === "name-asc")  return a.name.localeCompare(b.name);
      if (collectionSort === "name-desc") return b.name.localeCompare(a.name);
      if (collectionSort === "qty-desc")  return b.total - a.total || a.name.localeCompare(b.name);
      return a.total - b.total || a.name.localeCompare(b.name); // qty-asc
    });
  const collectionPageCount = Math.max(1, Math.ceil(collectionFiltered.length / COLLECTION_PAGE_SIZE));
  const collectionPageSafe = Math.min(collectionPage, collectionPageCount - 1);
  const collectionPageRows = collectionFiltered.slice(
    collectionPageSafe * COLLECTION_PAGE_SIZE,
    (collectionPageSafe + 1) * COLLECTION_PAGE_SIZE
  );

  // Letter → page index and first card name, only meaningful for alphabetical sorts
  const alphaSort = collectionSort === "name-asc" || collectionSort === "name-desc";
  const letterPageMap = new Map<string, number>();
  const letterFirstKeyMap = new Map<string, string>(); // letter → first card name on that page
  if (alphaSort) {
    collectionFiltered.forEach(({ name }, idx) => {
      const letter = name[0]?.toUpperCase();
      if (letter && !letterPageMap.has(letter)) {
        letterPageMap.set(letter, Math.floor(idx / COLLECTION_PAGE_SIZE));
        letterFirstKeyMap.set(letter, name);
      }
    });
  }
  // Which letter is active (first letter of the first card on the current page)
  const activeAlphaLetter = collectionPageRows[0]?.name[0]?.toUpperCase() ?? null;

  // After a letter jump, scroll to the target card once the new page renders
  useEffect(() => {
    if (!scrollToCollectionKey) return;
    const el = document.querySelector(`[data-collection-key="${CSS.escape(scrollToCollectionKey)}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setScrollToCollectionKey(null);
    }
  }, [scrollToCollectionKey, collectionPageRows]);

  // Scroll the list back to its top when the page changes (but not on letter-jump — that handles its own scroll)
  useEffect(() => {
    if (scrollToCollectionKey) return;
    collectionListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [collectionPageSafe]); // eslint-disable-line react-hooks/exhaustive-deps

  function getCommittedInfo(name: string): { total: number; deckCount: number } {
    let total = 0;
    let deckCount = 0;
    for (const deck of state.decks) {
      const card = deck.cards.find(c => c.name.toLowerCase() === name);
      if (card) { total += card.quantity; deckCount++; }
    }
    return { total, deckCount };
  }

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

      // Auto-tag owned cards from collection before creating deck
      const taggedCards = Object.keys(collection).length > 0
        ? applyCollectionToCards(result.cards, collection)
        : result.cards;

      const id = crypto.randomUUID();
      const name = deckName.trim() || `Deck ${state.decks.length + 1}`;
      const deck: Deck = {
        id,
        name,
        url: deckUrl.trim() || undefined,
        cards: taggedCards,
        createdAt: Date.now()
      };

      dispatch({ type: "ADD_DECK", payload: deck });
      setAllErrors(prev => ({ ...prev, [id]: result.errors }));
      setActiveDeckId(id);
      setImportText("");
      setDeckName("");
      setDeckUrl("");
      setShowImport(false);
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
        const [tagged] = applyCollectionToCards(result.cards, collection);
        dispatch({ type: "ADD_CARD", payload: { deckId: activeDeckId, card: tagged } });
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

  // ── Collection handlers ────────────────────────────────────────────────────
  function importCollectionFile(file: File) {
    setCollectionError(null);
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const raw = ev.target?.result as string ?? "";
        const parsed = parseCollectionCSV(raw);
        const cardCount = Object.keys(parsed).length;
        setCollection(parsed);
        setCollectionMeta({ fileName: file.name, importedAt: Date.now(), cardCount });
        dispatch({ type: "APPLY_COLLECTION", payload: parsed });
      } catch (err) {
        setCollectionError(err instanceof Error ? err.message : "Failed to parse CSV.");
      }
      if (csvReplaceInputRef.current) csvReplaceInputRef.current.value = "";
    };
    reader.readAsText(file);
  }

  function handleCollectionUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // First upload — no confirmation needed
    if (!collectionMeta) { importCollectionFile(file); return; }
    // Re-upload — store the pending file and show confirmation inline
    setPendingCsvFile(file);
    e.target.value = "";
  }

  function handleClearCollection() {
    setCollection({});
    setCollectionMeta(null);
    setCollectionError(null);
    setClearConfirming(false);
    dispatch({ type: "APPLY_COLLECTION", payload: {} });
  }

  function handleCollectionIncrement(key: string) {
    const updated = { ...collection };
    const printings = Array.isArray(updated[key]) ? [...updated[key]] : [];
    const gi = printings.findIndex(p => !p.set && !p.collectorNumber && !p.foil);
    if (gi >= 0) {
      printings[gi] = { ...printings[gi], quantity: printings[gi].quantity + 1 };
    } else {
      printings.push({ quantity: 1 });
    }
    updated[key] = printings;
    setCollection(updated);
    if (collectionMeta) setCollectionMeta({ ...collectionMeta, cardCount: Object.keys(updated).length });
    dispatch({ type: "APPLY_COLLECTION", payload: updated });
  }

  function handleCollectionDecrement(key: string) {
    const updated = { ...collection };
    const printings = Array.isArray(updated[key]) ? [...updated[key]] : [];
    const gi = printings.findIndex(p => !p.set && !p.collectorNumber && !p.foil);
    const ti = gi >= 0 ? gi : printings.length - 1;
    if (ti < 0) return;
    const next = printings[ti].quantity > 1
      ? printings.map((p, i) => i === ti ? { ...p, quantity: p.quantity - 1 } : p)
      : printings.filter((_, i) => i !== ti);
    if (next.length === 0) {
      delete updated[key];
    } else {
      updated[key] = next;
    }
    setCollection(updated);
    if (collectionMeta) setCollectionMeta({ ...collectionMeta, cardCount: Object.keys(updated).length });
    dispatch({ type: "APPLY_COLLECTION", payload: updated });
  }

  function handleCollectionRemove(key: string) {
    const updated = { ...collection };
    delete updated[key];
    setCollection(updated);
    if (collectionMeta) setCollectionMeta({ ...collectionMeta, cardCount: Object.keys(updated).length });
    dispatch({ type: "APPLY_COLLECTION", payload: updated });
  }

  function handleUpdatePrinting(key: string, idx: number, qty: number, set: string, cn: string, foil: boolean) {
    const updated = { ...collection };
    const printings = Array.isArray(updated[key]) ? [...updated[key]] : [];
    if (qty <= 0) {
      const next = printings.filter((_, i) => i !== idx);
      if (next.length === 0) { delete updated[key]; } else { updated[key] = next; }
    } else {
      printings[idx] = { quantity: qty, set: set.trim().toUpperCase() || undefined, collectorNumber: cn.trim() || undefined, foil: foil || undefined };
      updated[key] = printings;
    }
    setCollection(updated);
    if (collectionMeta) setCollectionMeta({ ...collectionMeta, cardCount: Object.keys(updated).length });
    dispatch({ type: "APPLY_COLLECTION", payload: updated });
  }

  function commitPrintingEdit() {
    if (!editingPrinting) return;
    const qty = parseInt(editingPrinting.qty, 10);
    handleUpdatePrinting(editingPrinting.key, editingPrinting.idx, isNaN(qty) ? 0 : qty, editingPrinting.set, editingPrinting.cn, editingPrinting.foil);
    setEditingPrinting(null);
  }

  function handleBulkEdit() {
    setBulkEditError(null);
    const parsed = parseDecklist(bulkEditText);
    if (parsed.length === 0) {
      setBulkEditError("No valid card lines found. Use the format: 4 Lightning Bolt");
      return;
    }
    const base: Collection = bulkEditMode === "replace" ? {} : { ...collection };
    for (const { count, name } of parsed) {
      const key = name.toLowerCase();
      if (count === 0) { delete base[key]; continue; }
      const existing = Array.isArray(base[key]) ? base[key] : [];
      const gi = existing.findIndex(p => !p.set && !p.collectorNumber && !p.foil);
      if (gi >= 0) {
        base[key] = existing.map((p, i) => i === gi ? { ...p, quantity: count } : p);
      } else {
        base[key] = [...existing, { quantity: count }];
      }
    }
    const cardCount = Object.keys(base).length;
    setCollection(base);
    setCollectionMeta({
      fileName: collectionMeta?.fileName ?? "Manual edit",
      importedAt: collectionMeta?.importedAt ?? Date.now(),
      cardCount,
    });
    dispatch({ type: "APPLY_COLLECTION", payload: base });
    setBulkEditText("");
    setBulkEditOpen(false);
  }

  // ── Archidekt import ───────────────────────────────────────────────────────
  function getArchidektId(url: string): string | null {
    const match = url.match(/archidekt\.com\/decks\/(\d+)/i);
    return match ? match[1] : null;
  }

  async function fetchFromArchidekt() {
    const deckId = getArchidektId(deckUrl);
    if (!deckId) return;
    setArchidektFetching(true);
    setArchidektError(null);
    try {
      const res = await fetch(`/api/archidekt?id=${deckId}`);
      if (!res.ok) throw new Error(`Archidekt returned ${res.status} — is the deck public?`);
      const data = await res.json();
      const lines = (data.cards as { quantity: number; categories: string[]; card: { oracleCard: { name: string } } }[])
        .filter(c => !c.categories?.includes("Maybeboard"))
        .map(c => `${c.quantity} ${c.card.oracleCard.name}`)
        .join("\n");
      setImportText(lines);
      if (!deckName.trim()) setDeckName(data.name ?? "");
    } catch (e) {
      setArchidektError(e instanceof Error ? e.message : "Failed to fetch from Archidekt.");
    } finally {
      setArchidektFetching(false);
    }
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

  // ── Edit menu ──────────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [editMenuOpen, setEditMenuOpen] = useState(false);
  const editMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (editMenuRef.current && !editMenuRef.current.contains(e.target as Node)) {
        setEditMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [editMenuOpen]);

  // Reset edit/select modes when the active deck changes
  useEffect(() => {
    setEditMode(false);
    setSelectMode(false);
  }, [activeDeckId]);

  // ── Feedback menu ──────────────────────────────────────────────────────────
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const feedbackMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!feedbackOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (feedbackMenuRef.current && !feedbackMenuRef.current.contains(e.target as Node)) {
        setFeedbackOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [feedbackOpen]);

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
            <span className="nav-label-short">Decks</span>
            <span className="nav-label-full">My Decks</span>
          </button>
          <button
            className={`nav-btn${view === "collection" ? " active" : ""}`}
            onClick={() => setView("collection")}
          >
            <span className="nav-label-short">Collection</span>
            <span className="nav-label-full">My Collection</span>
          </button>
        </nav>
        <div className="feedback-menu-container" ref={feedbackMenuRef}>
          <button
            className={`btn btn-secondary btn-sm feedback-btn${feedbackOpen ? " active" : ""}`}
            onClick={() => setFeedbackOpen(o => !o)}
            title="Give feedback"
          >
            <span className="feedback-label-full">Feedback</span>
            <span className="feedback-label-short">?</span>
          </button>
          {feedbackOpen && <div className="mobile-sheet-backdrop" onClick={() => setFeedbackOpen(false)} />}
          {feedbackOpen && (
            <div className="feedback-dropdown">
              <div className="feedback-dropdown-label">Have something to share?</div>
              <a
                className="feedback-item"
                href="https://github.com/Kagaiodin/deck-checklist/issues/new?template=bug_report.md"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setFeedbackOpen(false)}
              >
                🐛 Report a bug
                <span className="feedback-item-hint">Something not working right</span>
              </a>
              <a
                className="feedback-item"
                href="https://github.com/Kagaiodin/deck-checklist/issues/new?template=feature_request.md"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setFeedbackOpen(false)}
              >
                ✨ Request a feature
                <span className="feedback-item-hint">Suggest an idea or improvement</span>
              </a>
            </div>
          )}
        </div>
      </header>

      <main className="app-main">

        {view === "decks" && (
          <div className="decks-layout">

            {/* ── Mobile deck picker overlay ───────────────────────────────── */}
            {deckPickerOpen && (
              <div className="deck-picker-overlay" onClick={() => setDeckPickerOpen(false)}>
                <div className="deck-picker-sheet" onClick={e => e.stopPropagation()}>
                  <div className="deck-picker-header">
                    <span className="deck-picker-title">My Decks</span>
                    <button className="deck-picker-close" onClick={() => setDeckPickerOpen(false)}>✕</button>
                  </div>
                  <ul className="deck-picker-list">
                    {state.decks.length === 0 ? (
                      <li className="deck-picker-empty">No decks yet — import one to get started.</li>
                    ) : state.decks.map(deck => {
                      const acquiredCards = deck.cards.filter(c => c.acquired).reduce((s, c) => s + c.quantity, 0);
                      const totalCards = deck.cards.reduce((s, c) => s + c.quantity, 0);
                      return (
                        <li
                          key={deck.id}
                          className={`deck-item${activeDeckId === deck.id ? " active" : ""}`}
                          onClick={() => { setActiveDeckId(deck.id); setDeckPickerOpen(false); }}
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
                  <div className="deck-picker-footer">
                    <button
                      className="btn btn-primary"
                      style={{ width: "100%" }}
                      onClick={() => { setDeckPickerOpen(false); setShowImport(true); }}
                    >
                      + Import Deck
                    </button>
                  </div>
                </div>
              </div>
            )}

            <aside className={`deck-sidebar${sidebarOpen ? "" : " sidebar-collapsed"}`}>
              <div className="sidebar-header">
                <h2>Decks</h2>
                <button className="btn btn-primary btn-sm" onClick={() => setShowImport(v => !v)}>
                  {showImport ? "✕ Cancel" : "+ Import"}
                </button>
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
              {/* ── Import panel ─────────────────────────────────────────── */}
              {showImport && (
                <section className="import-panel">
                  <div className="import-panel-header">
                    <h2>Import Decklist</h2>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(false)}>✕ Cancel</button>
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
                  <input
                    className="deck-name-input"
                    placeholder="Deck name (optional)"
                    value={deckName}
                    onChange={e => setDeckName(e.target.value)}
                    disabled={validating}
                  />
                  <div className="url-field-row">
                    <input
                      className="deck-name-input"
                      placeholder="Deck URL (optional) — paste an Archidekt URL to auto-import"
                      value={deckUrl}
                      onChange={e => { setDeckUrl(e.target.value); setArchidektError(null); }}
                      disabled={validating || archidektFetching}
                    />
                    {getArchidektId(deckUrl) && (
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
                  <button
                    className="btn btn-primary"
                    onClick={handleImport}
                    disabled={validating || !importText.trim()}
                  >
                    {validating ? "Validating…" : "Import & Validate"}
                  </button>
                </section>
              )}

              {/* ── Mobile deck switcher bar (hidden on desktop) ─────────── */}
              <div className="mobile-deck-bar">
                <button className="mobile-deck-current" onClick={() => setDeckPickerOpen(true)}>
                  <div className="mobile-deck-info">
                    <span className="mobile-deck-name">
                      {activeDeck ? activeDeck.name : "Select a deck…"}
                    </span>
                    <span className="mobile-deck-sub">
                      {state.decks.length} deck{state.decks.length !== 1 ? "s" : ""} · tap to switch
                    </span>
                  </div>
                  <span className="mobile-deck-chevron">▾</span>
                </button>
              </div>

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

                      {/* Edit menu */}
                      {(editMode || selectMode) ? (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => { setEditMode(false); setSelectMode(false); }}
                        >
                          Done
                        </button>
                      ) : (
                        <div className="edit-menu-container" ref={editMenuRef}>
                          <button
                            className={`btn btn-secondary btn-sm${editMenuOpen ? " active" : ""}`}
                            onClick={() => setEditMenuOpen(v => !v)}
                          >
                            Edit {editMenuOpen ? "▴" : "▾"}
                          </button>
                          {editMenuOpen && (
                            <div className="edit-menu-dropdown">
                              <button className="edit-menu-item" onClick={() => { setEditMenuOpen(false); setSelectMode(true); }}>
                                Bulk tag
                                <span className="edit-menu-item-hint">Select cards and set a source tag</span>
                              </button>
                              <div className="edit-menu-divider" />
                              <button className="edit-menu-item" onClick={() => { setEditMenuOpen(false); setEditMode(true); }}>
                                Edit deck
                                <span className="edit-menu-item-hint">Add, remove, or adjust quantities</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <ErrorQueue
                    errors={errors}
                    onRemap={handleRemap}
                    onDismiss={handleDismiss}
                  />
                  <Checklist
                    deck={activeDeck}
                    editMode={editMode}
                    selectMode={selectMode}
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
                  <button className="btn btn-primary" onClick={() => setShowImport(true)}>
                    Import Deck
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Collection tab ─────────────────────────────────────────────── */}
        {view === "collection" && (() => {
          // ── Collection-level rollups ──────────────────────────────────────
          const collectionEntries = Object.entries(collection).map(([name, raw]) => ({
            name,
            printings: Array.isArray(raw) ? raw : [],
          }));
          const totalCards  = collectionEntries.reduce((s, { printings }) => s + printings.reduce((ps, p) => ps + p.quantity, 0), 0);
          const foilTotal   = collectionEntries.reduce((s, { printings }) => s + printings.filter(p => p.foil).reduce((ps, p) => ps + p.quantity, 0), 0);
          const deckCardNames = new Set(state.decks.flatMap(d => d.cards.map(c => c.name.toLowerCase())));
          const inDecksCount = collectionEntries.filter(({ name }) => deckCardNames.has(name)).length;

          return (
          <section className="collection-panel">
            <div className="collection-header">
              <h2>My Collection</h2>
              <div className="collection-header-actions">
                <input
                  ref={csvReplaceInputRef}
                  type="file"
                  accept=".csv"
                  className="file-upload-input"
                  onChange={handleCollectionUpload}
                />
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => csvReplaceInputRef.current?.click()}
                >
                  {collectionMeta ? "Replace CSV" : "Upload CSV"}
                </button>
                <button
                  className={`btn btn-secondary btn-sm${bulkEditOpen ? " active" : ""}`}
                  onClick={() => setBulkEditOpen(v => !v)}
                >
                  Bulk edit
                </button>
              </div>
            </div>

            {/* Stats strip */}
            {collectionMeta && totalCards > 0 && (
              <div className="collection-stats-strip">
                <div className="collection-stat">
                  <span className="collection-stat-num">{totalCards.toLocaleString()}</span>
                  <span className="collection-stat-lbl">Total cards</span>
                </div>
                <div className="collection-stat">
                  <span className="collection-stat-num">{collectionMeta.cardCount.toLocaleString()}</span>
                  <span className="collection-stat-lbl">Unique</span>
                </div>
                {state.decks.length > 0 && (
                  <div className="collection-stat">
                    <span className="collection-stat-num collection-stat-accent">{inDecksCount.toLocaleString()}</span>
                    <span className="collection-stat-lbl">In a deck</span>
                  </div>
                )}
                {foilTotal > 0 && (
                  <div className="collection-stat">
                    <span className="collection-stat-num">✦ {foilTotal.toLocaleString()}</span>
                    <span className="collection-stat-lbl">Foils</span>
                  </div>
                )}
              </div>
            )}

            {collectionMeta && (
              <p className="collection-meta">
                {collectionMeta.fileName} · imported {new Date(collectionMeta.importedAt).toLocaleDateString()}
              </p>
            )}

            {collectionError && <p className="import-error">{collectionError}</p>}

            {pendingCsvFile && (
              <div className="collection-confirm-banner">
                <span>Replace <strong>{collectionMeta?.cardCount.toLocaleString()} cards</strong> with <strong>{pendingCsvFile.name}</strong>?</span>
                <div className="collection-confirm-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => { importCollectionFile(pendingCsvFile); setPendingCsvFile(null); }}>Replace</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPendingCsvFile(null)}>Cancel</button>
                </div>
              </div>
            )}

            {bulkEditOpen && (
              <div className="collection-bulk-panel">
                <p className="collection-bulk-hint">
                  Paste cards in decklist format (<code>4 Lightning Bolt</code>). Listed cards have their quantities set; unlisted cards are unchanged unless Replace mode is selected.
                </p>
                <div className="collection-bulk-mode">
                  <label>
                    <input type="radio" name="bulk-mode" value="merge" checked={bulkEditMode === "merge"} onChange={() => setBulkEditMode("merge")} />
                    {" "}Merge
                  </label>
                  <label>
                    <input type="radio" name="bulk-mode" value="replace" checked={bulkEditMode === "replace"} onChange={() => setBulkEditMode("replace")} />
                    {" "}Replace all
                  </label>
                </div>
                <textarea
                  className="import-textarea"
                  value={bulkEditText}
                  onChange={e => setBulkEditText(e.target.value)}
                  placeholder={"4 Lightning Bolt\n2x Snapcaster Mage\n1 Black Lotus"}
                  rows={6}
                />
                {bulkEditError && <p className="import-error">{bulkEditError}</p>}
                <div className="collection-bulk-actions">
                  <button className="btn btn-primary btn-sm" onClick={handleBulkEdit} disabled={!bulkEditText.trim()}>
                    Apply
                  </button>
                  {collectionMeta && !clearConfirming && (
                    <button className="btn btn-ghost btn-sm collection-clear-btn" onClick={() => setClearConfirming(true)}>
                      Clear collection
                    </button>
                  )}
                  {clearConfirming && (
                    <>
                      <span className="collection-clear-confirm-text">Remove all {collectionMeta?.cardCount.toLocaleString()} cards?</span>
                      <button className="btn btn-ghost btn-sm collection-clear-btn" onClick={() => { handleClearCollection(); setBulkEditOpen(false); }}>Yes, clear</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setClearConfirming(false)}>Cancel</button>
                    </>
                  )}
                </div>
              </div>
            )}

            {!collectionMeta && !collectionError && (
              <div className="collection-empty">
                <p>No collection uploaded yet.</p>
                <p className="collection-empty-hint">
                  Export your collection from Moxfield (Account → Collection → Export) or any other supported app and upload the CSV above. Cards you own will be automatically tagged across all your decks.
                </p>
              </div>
            )}

            {collectionMeta && (
              <>
                <div className="collection-controls">
                  <input
                    className="deck-name-input collection-search"
                    placeholder="Search cards…"
                    value={collectionSearch}
                    onChange={e => { setCollectionSearch(e.target.value); setCollectionPage(0); }}
                  />
                  <select
                    className="collection-sort-select"
                    value={collectionSort}
                    onChange={e => { setCollectionSort(e.target.value as typeof collectionSort); setCollectionPage(0); }}
                  >
                    <option value="name-asc">Name A→Z</option>
                    <option value="name-desc">Name Z→A</option>
                    <option value="qty-desc">Quantity ↓</option>
                    <option value="qty-asc">Quantity ↑</option>
                  </select>
                </div>

                {alphaSort && (
                  <div className="collection-alpha-strip">
                    {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(letter => {
                      const page = letterPageMap.get(letter);
                      const isActive = letter === activeAlphaLetter;
                      return (
                        <button
                          key={letter}
                          className={`collection-alpha-btn${isActive ? " active" : ""}${page === undefined ? " empty" : ""}`}
                          onClick={() => {
                            if (page === undefined) return;
                            const firstKey = letterFirstKeyMap.get(letter);
                            setCollectionPage(page);
                            if (firstKey) setScrollToCollectionKey(firstKey);
                          }}
                          disabled={page === undefined}
                        >
                          {letter}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="collection-pagination">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setCollectionPage(p => Math.max(0, p - 1))}
                    disabled={collectionPageSafe === 0}
                  >
                    ← Prev
                  </button>
                  <span className="collection-page-info">
                    Page {collectionPageSafe + 1} of {collectionPageCount}
                    <span className="collection-page-total"> · {collectionFiltered.length.toLocaleString()} cards</span>
                  </span>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setCollectionPage(p => Math.min(collectionPageCount - 1, p + 1))}
                    disabled={collectionPageSafe >= collectionPageCount - 1}
                  >
                    Next →
                  </button>
                </div>

                {collectionFiltered.length === 0 && collectionSearch && (
                  <p className="collection-empty-search">
                    No cards found matching "<strong>{collectionSearch}</strong>"
                  </p>
                )}

                <ul className="collection-list" ref={collectionListRef}>
                  {collectionPageRows.map(({ name, printings, total }) => {
                    const isExpanded = expandedCollectionKey === name;
                    // Always compute so we can show deck chip on the collapsed row
                    const committed = getCommittedInfo(name);
                    // Proper display name: title-case the stored lowercase key
                    // TODO: store original casing on import for correct MTG proper nouns
                    const displayName = name.replace(/(?:^|\s|-)\S/g, c => c.toUpperCase());
                    return (
                      <li key={name} data-collection-key={name} className={`collection-row${isExpanded ? " expanded" : ""}`}>
                        <div className="collection-row-summary">
                          <button
                            className="collection-row-expand"
                            onClick={() => setExpandedCollectionKey(isExpanded ? null : name)}
                          >
                            <span className="collection-card-name">{displayName}</span>
                            {committed.total > 0 && state.decks.length > 0 && (
                              <span className="collection-deck-chip">
                                in {committed.deckCount} deck{committed.deckCount !== 1 ? "s" : ""}
                              </span>
                            )}
                            <span className="collection-expand-chevron">{isExpanded ? "▴" : "▾"}</span>
                          </button>
                          <div className="collection-row-controls">
                            <button className="collection-qty-btn" onClick={() => handleCollectionDecrement(name)} aria-label="Remove one">−</button>
                            <span className="collection-card-qty">{total}×</span>
                            <button className="collection-qty-btn" onClick={() => handleCollectionIncrement(name)} aria-label="Add one">+</button>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="collection-row-detail">
                            <ul className="collection-printings">
                              {printings.map((p, i) => {
                                const isEditingThis = editingPrinting?.key === name && editingPrinting?.idx === i;
                                return (
                                  <li key={i} className={`collection-printing${isEditingThis ? " editing" : ""}`}>
                                    {isEditingThis ? (
                                      <>
                                        <input
                                          type="number" min="0"
                                          className="collection-printing-input collection-printing-qty-input"
                                          value={editingPrinting.qty}
                                          onChange={e => setEditingPrinting({ ...editingPrinting, qty: e.target.value })}
                                          onKeyDown={e => { if (e.key === "Enter") commitPrintingEdit(); if (e.key === "Escape") setEditingPrinting(null); }}
                                          autoFocus
                                        />
                                        <span>×</span>
                                        <input
                                          type="text"
                                          className="collection-printing-input collection-printing-set-input"
                                          value={editingPrinting.set}
                                          placeholder="Set"
                                          onChange={e => setEditingPrinting({ ...editingPrinting, set: e.target.value })}
                                          onKeyDown={e => { if (e.key === "Enter") commitPrintingEdit(); if (e.key === "Escape") setEditingPrinting(null); }}
                                        />
                                        <input
                                          type="text"
                                          className="collection-printing-input collection-printing-cn-input"
                                          value={editingPrinting.cn}
                                          placeholder="#CN"
                                          onChange={e => setEditingPrinting({ ...editingPrinting, cn: e.target.value })}
                                          onKeyDown={e => { if (e.key === "Enter") commitPrintingEdit(); if (e.key === "Escape") setEditingPrinting(null); }}
                                        />
                                        <label className="collection-printing-foil-label">
                                          <input type="checkbox" checked={editingPrinting.foil} onChange={e => setEditingPrinting({ ...editingPrinting, foil: e.target.checked })} />
                                          Foil
                                        </label>
                                        <button className="collection-printing-save" onClick={commitPrintingEdit} aria-label="Save">✓</button>
                                        <button className="collection-printing-cancel" onClick={() => setEditingPrinting(null)} aria-label="Cancel">✕</button>
                                      </>
                                    ) : (
                                      <button
                                        className="collection-printing-display"
                                        onClick={() => setEditingPrinting({ key: name, idx: i, qty: String(p.quantity), set: p.set ?? "", cn: p.collectorNumber ?? "", foil: p.foil ?? false })}
                                      >
                                        <span className="collection-printing-qty">{p.quantity}×</span>
                                        <span className="collection-printing-set">
                                          {p.set ?? "Unknown set"}
                                          {p.collectorNumber ? ` #${p.collectorNumber}` : ""}
                                        </span>
                                        {p.foil && <span className="collection-printing-foil">✦ Foil</span>}
                                        <span className="collection-printing-edit-hint">Edit</span>
                                      </button>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                            {committed && state.decks.length > 0 && (
                              <p className="collection-committed">
                                {committed.total > 0
                                  ? `${committed.total} committed across ${committed.deckCount} deck${committed.deckCount !== 1 ? "s" : ""}`
                                  : "Not in any deck"}
                              </p>
                            )}
                            <div className="collection-detail-footer">
                              <button
                                className="btn btn-ghost btn-sm collection-remove-all-btn"
                                onClick={() => handleCollectionRemove(name)}
                              >
                                Remove all copies
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {collectionPageCount > 1 && (
                  <div className="collection-pagination collection-pagination-bottom">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setCollectionPage(p => Math.max(0, p - 1))}
                      disabled={collectionPageSafe === 0}
                    >
                      ← Prev
                    </button>
                    <span className="collection-page-info">
                      Page {collectionPageSafe + 1} of {collectionPageCount}
                    </span>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setCollectionPage(p => Math.min(collectionPageCount - 1, p + 1))}
                      disabled={collectionPageSafe >= collectionPageCount - 1}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        );
      })()}
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
