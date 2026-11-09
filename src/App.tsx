import { commanderToastTitle } from "./utils/commander";
import { useState, useEffect, useRef } from "react";
import "./tokens.css";
import "./App.css";
import { DeckProvider, useDecks } from "./store/decks";
import { parseDecklist } from "./utils/parser";
import { enrichDeckExtraInfo } from "./utils/validator";
import { refreshDeckPrices, needsPriceRefresh } from "./utils/deckCost";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useOrders } from "./features/orders/useOrders";
import { useTradeLedger } from "./features/transactions/ledger/useTradeLedger";
import { Checklist } from "./components/Checklist";
import { EmptyState } from "./components/EmptyState";
import { ErrorQueue } from "./components/ErrorQueue";
import type { Deck, AcquisitionSource } from "./types/index";
import { formatOptions } from "./utils/deckFormats";
import { getDeckColorIdentity, formatRelativeDate, getDeckDomain } from "./utils/deckUtils";
import { CollectionPage } from "./features/collection/CollectionPage";
import { TradePage } from "./features/trade/TradePage";
import { clearTradeHash } from "./features/trade/tradeHash";
import { extractPayload } from "./utils/tradeShare";
import { TransactionsPage, type TransactionsTab } from "./features/transactions/TransactionsPage";
import type { TradeOrigin } from "./features/trade/TradePage";
import type { TradeSeed } from "./features/trade/seedCard";
import { DeckImportPanel, type ImportedDeck } from "./features/deck-import/DeckImportPanel";
import { lookupCard, EMPTY_IMPORT_DRAFT, type ImportDraft } from "./features/deck-import/deckImport";
import { OnboardingModal } from "./features/onboarding/OnboardingModal";
import { BackupControls } from "./features/backup/BackupControls";
import { ImportBackupModal } from "./features/backup/ImportBackupModal";
import { GoogleDriveBackup } from "./features/backup/GoogleDriveBackup";
import { consumeImportToasts, BACKUP_IMPORTED_KEY } from "./features/backup/backup";
import { exportBackup } from "./features/backup/saveBackupFile";
import { ThemeToggle } from "./components/ThemeToggle";
import { BugIcon, LightbulbIcon } from "./components/MenuIcons";
import { DemoBanner } from "./features/demo/DemoBanner";
import { DemoConfirmModal } from "./features/demo/DemoConfirmModal";
import { DemoMenuItem } from "./features/demo/DemoMenuItem";
import { useReloadOnOtherTabWrite } from "./hooks/useReloadOnOtherTabWrite";
import { isDemoActive, hasRealData, DEMO_BACKUP_HINT, DEMO_ACTIVE_KEY, DEMO_VERSION_KEY } from "./features/demo/demoMode";
import {
  startDemo, leaveDemo, consumeRecoveredFlag, hasPendingLinkConfirm, clearPendingLinkConfirm,
} from "./features/demo/demoControl";
import { AppLogo } from "./components/AppLogo";
import type { ToastInput } from "./types/index";
import { BuyListSheet } from "./features/card-purchase/BuyListSheet";
import { useBuyFlow } from "./features/card-purchase/useBuyFlow";
import { collectionStore, useCollection } from "./store/collection";
import { ONBOARDING_DISMISSED_KEY, SIDEBAR_COLLAPSED_KEY } from "./store/storageKeys";
import "./features/card-purchase/buy-flow.css";

/** Where the Calculator's back control returns to, for each place it can be opened from. */
// Another tab writes one of these when it replaces the saved data wholesale: entering or leaving
// demo mode, refreshing the sample data, importing a Backup. This tab then reloads.
const DATA_REPLACED_KEYS = [DEMO_ACTIVE_KEY, DEMO_VERSION_KEY, BACKUP_IMPORTED_KEY];

const TRADE_RETURN: Record<TradeOrigin, { view: "collection" | "transactions"; subTab?: TransactionsTab }> = {
  collection: { view: "collection" },
  binder: { view: "transactions", subTab: "binder" },
  trades: { view: "transactions", subTab: "trades" },
  // A share link opens on Binder, so back lands there too.
  link: { view: "transactions", subTab: "binder" },
};

const isTradePath = () => /^\/trade\/?$/.test(window.location.pathname);

/** `/trade` or a `/#trade=…` share link opens the trade Calculator (under Transactions → Binder) instead of the default tab. */
const openedWithTradeLink = () => isTradePath() || extractPayload(window.location.hash) !== null;

function AppInner() {
  const { state, dispatch } = useDecks();
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [view, setView] = useState<"decks" | "collection" | "transactions">(() => (openedWithTradeLink() ? "transactions" : "decks"));
  const [txSubTab, setTxSubTab] = useState<TransactionsTab>(() => (openedWithTradeLink() ? "binder" : "buys"));
  // The Calculator renders inside Transactions, replacing the sub-tab body. `tradeOrigin` is where
  // its back control returns to; `tradeKey` remounts it for a new link.
  const [tradeOpen, setTradeOpen] = useState<boolean>(openedWithTradeLink);
  const [tradeOrigin, setTradeOrigin] = useState<TradeOrigin>(() => (openedWithTradeLink() ? "link" : "collection"));
  const [tradeKey, setTradeKey] = useState(0);
  const [tradeSeed, setTradeSeed] = useState<TradeSeed | undefined>(undefined);
  const [showImport, setShowImport] = useState(false);
  // The unsent Decklist lives here, not in the panel, so it survives Cancel and a trip to another tab.
  const [importDraft, setImportDraft] = useState<ImportDraft>(EMPTY_IMPORT_DRAFT);
  const [renamingDeckId, setRenamingDeckId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) !== "true"; }
    catch { return true; }
  });
  const [deckPickerOpen, setDeckPickerOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [deletingDeckId, setDeletingDeckId] = useState<string | null>(null);
  const [unmarkingBuiltDeckId, setUnmarkingBuiltDeckId] = useState<string | null>(null);
  const [editingFormatId, setEditingFormatId] = useState<string | null>(null);
  const [formatDraft, setFormatDraft] = useState("");
  const [enrichingDeckIds, setEnrichingDeckIds] = useState<Set<string>>(new Set());
  const [pricingDeckIds, setPricingDeckIds] = useState<Set<string>>(new Set());
  const pricingAttemptedRef = useRef<Set<string>>(new Set());

  // ── Sidebar persistence + keyboard shortcut ───────────────────────────────
  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarOpen ? "false" : "true"); }
    catch { /* storage unavailable: the preference just isn't remembered */ }
  }, [sidebarOpen]);

  useEffect(() => {
    function onSidebarKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setSidebarOpen(o => !o);
      }
    }
    document.addEventListener("keydown", onSidebarKey);
    return () => document.removeEventListener("keydown", onSidebarKey);
  }, []);

  // ── Onboarding modal ──────────────────────────────────────────────────────
  const [onboardingDismissed, setOnboardingDismissed] = useLocalStorage<boolean>(ONBOARDING_DISMISSED_KEY, false);
  const showOnboarding = state.decks.length === 0 && !onboardingDismissed;

  function dismissOnboarding() {
    setOnboardingDismissed(true);
  }

  function handleOnboardingImport() {
    setOnboardingDismissed(true);
    setShowImport(true);
  }

  // ── Demo mode ─────────────────────────────────────────────────────────────
  // Enter/exit write storage and reload, so this is stable for the page's lifetime.
  const demoActive = isDemoActive(window.localStorage);
  const [demoConfirmOpen, setDemoConfirmOpen] = useState(hasPendingLinkConfirm);
  useReloadOnOtherTabWrite(DATA_REPLACED_KEYS);

  useEffect(() => {
    for (const toast of consumeImportToasts()) showToast(toast);
    if (consumeRecoveredFlag()) {
      showToast({
        title: "Demo mode ended",
        sub: "Your saved copy couldn't be restored, so the sample data was cleared.",
        variant: "warn",
        autoDismiss: 6000,
      });
    }
  }, []);

  function requestSampleData() {
    if (hasRealData(window.localStorage)) setDemoConfirmOpen(true);
    else void loadSampleData();
  }

  async function loadSampleData() {
    setDemoConfirmOpen(false);
    clearPendingLinkConfirm();
    let ok = false;
    try {
      ok = await startDemo("settings");
    } catch {
      // lazy chunk failed to load (offline, or a deploy replaced it)
    }
    if (!ok) {
      showToast({ title: "Couldn't load sample data", sub: "Your data is untouched. Check your connection and storage, then try again.", variant: "warn", autoDismiss: 5000 });
    }
  }

  // ── Collection (one shared store; handlers read it fresh with collectionStore.get()) ──
  const { collection } = useCollection();

  const [notificationFilterIds, setNotificationFilterIds] = useState<string[] | null>(null);

  // ── Toast system ──────────────────────────────────────────────────────────
  type Toast = { id: string } & ToastInput;
  const [toasts, setToasts] = useState<Toast[]>([]);
  function showToast(t: ToastInput) {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { ...t, id }]);
    if (t.autoDismiss) {
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), t.autoDismiss);
    }
  }

  // ── Backup import panel state (shared across sidebar + mobile sheet) ──
  const [importPanelOpen, setImportPanelOpen] = useState(false);



  const activeDeck = state.decks.find(d => d.id === activeDeckId) ?? null;

  // Backfill/refresh prices when a deck is opened (at most once per deck per session,
  // so an offline failure doesn't retry in a loop). Failed batches keep their prior prices.
  useEffect(() => {
    if (!activeDeck) return;
    const { id } = activeDeck;
    if (pricingAttemptedRef.current.has(id) || !needsPriceRefresh(activeDeck, Date.now())) return;
    pricingAttemptedRef.current.add(id);
    setPricingDeckIds(prev => new Set(prev).add(id));
    refreshDeckPrices(activeDeck.cards).then(({ prices, ok }) => {
      if (Object.keys(prices).length === 0) return;
      dispatch({ type: "SET_DECK_PRICES", payload: { deckId: id, prices, updatedAt: ok ? Date.now() : undefined } });
    }).finally(() => {
      setPricingDeckIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    });
  }, [activeDeck, dispatch]);

  const errors = activeDeckId ? (state.errors[activeDeckId] ?? []) : [];

  function handleDeckImported({ name, url, format, built, cards, errors }: ImportedDeck) {
    const id = crypto.randomUUID();
    const deck: Deck = {
      id,
      name,
      url,
      format,
      cards,
      createdAt: Date.now(),
      isBuilt: built || undefined,
      pricesUpdatedAt: cards.some(c => c.price !== undefined) ? Date.now() : undefined,
    };
    dispatch({ type: "ADD_DECK", payload: deck, errors });
    setActiveDeckId(id);
    setShowImport(false);
    setImportDraft(EMPTY_IMPORT_DRAFT);

    // Fire-and-forget enrichment (tokens + alt printings)
    setEnrichingDeckIds(prev => new Set(prev).add(id));
    enrichDeckExtraInfo(cards).then(extraInfo => {
      dispatch({ type: "SET_EXTRA_INFO", payload: { deckId: id, extraInfo } });
    }).finally(() => {
      setEnrichingDeckIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    });
  }

  function handleToggleDeckBuilt(deckId: string) {
    const deck = state.decks.find(d => d.id === deckId);
    if (!deck) return;
    dispatch({ type: "SET_DECK_BUILT", payload: { deckId, built: !deck.isBuilt, collection: collectionStore.get() } });
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

  function handleToggleCommander(cardId: string) {
    if (!activeDeckId) return;
    const deck = state.decks.find(d => d.id === activeDeckId);
    const card = deck?.cards.find(c => c.id === cardId);
    if (!deck || !card) return;
    const was = deck.commanderIds?.includes(cardId) ?? false;
    dispatch({ type: "TOGGLE_COMMANDER", payload: { deckId: activeDeckId, cardId } });
    showToast({ title: commanderToastTitle(card.name, was), variant: "success", autoDismiss: 2500 });
  }

  function handleDismissCommanderPrompt() {
    if (!activeDeckId) return;
    dispatch({ type: "DISMISS_COMMANDER_PROMPT", payload: { deckId: activeDeckId } });
  }

  function handleUpdateQuantity(cardId: string, quantity: number) {
    if (!activeDeckId) return;
    dispatch({ type: "UPDATE_CARD_QUANTITY", payload: { deckId: activeDeckId, cardId, quantity } });
  }

  async function handleAddCard(line: string): Promise<{ success: boolean; error?: string }> {
    if (!activeDeckId) return { success: false, error: "No deck selected." };
    try {
      const [entry] = parseDecklist(line);
      if (!entry) return { success: false, error: "Invalid card format." };
      const card = await lookupCard(entry, { collection: collectionStore.get });
      if (card) {
        dispatch({ type: "ADD_CARD", payload: { deckId: activeDeckId, card } });
        return { success: true };
      }
      return { success: false, error: `"${entry.name}" not found on Scryfall.` };
    } catch {
      return { success: false, error: "Validation failed. Please try again." };
    }
  }

  async function handleRemap(originalName: string, newName: string) {
    if (!activeDeckId) return;
    const deckId = activeDeckId;
    const count = errors.find(e => e.originalName === originalName)?.count ?? 1;
    try {
      const card = await lookupCard({ name: newName, count }, { collection: collectionStore.get });
      dispatch({ type: "REMAP_DECK_ERROR", payload: { deckId, originalName, searchName: newName, card: card ?? undefined } });
    } catch {
      // leave the error in queue if the remap lookup fails
    }
  }

  function handleDismiss(originalName: string) {
    if (!activeDeckId) return;
    dispatch({ type: "DISMISS_DECK_ERROR", payload: { deckId: activeDeckId, originalName } });
  }

  function handleCreateBlankDeck() {
    const id = crypto.randomUUID();
    dispatch({ type: "ADD_DECK", payload: { id, name: "New deck", cards: [], createdAt: Date.now() } });
    setActiveDeckId(id);
  }

  // ── Orders ────────────────────────────────────────────────────────────────
  const orders = useOrders({ collectionStore, dispatch });

  const { entries: ledger, logTrade, deleteEntry: deleteLedgerEntry } = useTradeLedger({
    collectionStore,
  });
  const [ledgerOpenId, setLedgerOpenId] = useState<string | null>(null);

  function viewLedgerEntry(id: string) {
    closeTrade();
    setLedgerOpenId(id);
    setTxSubTab("trades");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function handleDismissNotification(deckId: string, notificationId: string) {
    dispatch({ type: "DISMISS_NOTIFICATION", payload: { deckId, notificationId } });
    setNotificationFilterIds(null);
  }

  function handleDeleteDeck(id: string) {
    dispatch({ type: "DELETE_DECK", payload: id });
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

  function startEditFormat(deck: Deck) {
    setEditingFormatId(deck.id);
    setFormatDraft(deck.format ?? "");
  }

  function commitFormat() {
    if (editingFormatId !== null) {
      const trimmed = formatDraft.trim() || undefined;
      dispatch({ type: "SET_DECK_FORMAT", payload: { id: editingFormatId, format: trimmed } });
    }
    setEditingFormatId(null);
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

  // ── Buy flow ───────────────────────────────────────────────────────────────
  const toBuyCards = activeDeck?.cards.filter(c => c.source === "need_to_buy") ?? [];
  const toBuyTotal = toBuyCards.reduce((s, c) => s + c.quantity, 0);

  function switchView(v: "decks" | "collection" | "transactions") {
    if (tradeOpen) closeTrade();
    setView(v);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  // ── Trade (Calculator, rendered inside Transactions) ───────────────────────
  function openTrade(origin: TradeOrigin, seed?: TradeSeed) {
    setTradeOrigin(origin);
    setTradeSeed(seed);
    setView("transactions");
    setTradeKey(k => k + 1);
    setTradeOpen(true);
  }

  function closeTrade() {
    clearTradeHash();
    // Otherwise a reload on `/trade` would reopen Trade.
    if (isTradePath()) window.history.replaceState(null, "", "/" + window.location.search);
    setTradeSeed(undefined);
    setTradeOpen(false);
  }

  /** The Calculator's back control: return to wherever it was opened from. */
  function leaveTrade() {
    closeTrade();
    const { view: backView, subTab } = TRADE_RETURN[tradeOrigin];
    setView(backView);
    if (subTab) setTxSubTab(subTab);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  // A share link pasted into an already-open tab only changes the hash, so listen for it.
  useEffect(() => {
    function onHashChange() {
      if (!openedWithTradeLink()) return;
      setTradeOrigin("link");
      setTradeSeed(undefined);
      setView("transactions");
      setTradeKey(k => k + 1);
      setTradeOpen(true);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const buyFlow = useBuyFlow({
    toBuyCards,
    deckId: activeDeckId,
    onCreateOrder: orders.create,
    onViewOrder: () => { setTxSubTab("buys"); switchView("transactions"); },
    nextOrderId: () => crypto.randomUUID(),
  });

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

  // ── Edit / Select mode ─────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [selectMode, setSelectMode] = useState(false);

  // Reset edit/select modes and notification filter when the active deck changes
  useEffect(() => {
    setEditMode(false);
    setSelectMode(false);
    setNotificationFilterIds(null);
  }, [activeDeckId]);

  // ── Overflow menu (⋮) — ThemeToggle + feedback links ─────────────────────
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(e.target as Node)) {
        setOverflowMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredDecks = sidebarSearch.trim()
    ? state.decks.filter(d => d.name.toLowerCase().includes(sidebarSearch.toLowerCase()))
    : state.decks;

  return (
    <div className="app">
      {demoActive && <DemoBanner onExit={() => leaveDemo()} />}
      {demoConfirmOpen && (
        <DemoConfirmModal
          onCancel={() => { setDemoConfirmOpen(false); clearPendingLinkConfirm(); }}
          onConfirm={() => void loadSampleData()}
        />
      )}
      {/* ── First-run onboarding modal ────────────────────────────────────── */}
      {showOnboarding && (
        <OnboardingModal
          onDismiss={dismissOnboarding}
          onImportDeck={handleOnboardingImport}
        />
      )}
      {/* ── Import backup modal ───────────────────────────────────────────── */}
      {importPanelOpen && (
        <ImportBackupModal onClose={() => setImportPanelOpen(false)} />
      )}
      {/* ── Toast container ───────────────────────────────────────────────── */}
      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast${t.variant === "warn" ? " toast--warn" : t.variant === "neutral" ? " toast--neutral" : ""}`}>
            <div className="toast-body">
              <div className="toast-title">{t.title}</div>
              {t.sub && <div className="toast-sub">{t.sub}</div>}
            </div>
            <button className="toast-close" aria-label="Dismiss notification" onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>×</button>
          </div>
        ))}
      </div>
      <header className="app-header">
        <h1 className="app-title">
          <AppLogo className="app-logo" />
        </h1>
        <nav className="app-nav">
          <button
            className={`nav-btn${view === "decks" ? " active" : ""}`}
            onClick={() => switchView("decks")}
          >
            <span className="nav-label-short">Decks</span>
            <span className="nav-label-full">Decks</span>
          </button>
          <button
            className={`nav-btn${view === "collection" ? " active" : ""}`}
            onClick={() => switchView("collection")}
          >
            <span className="nav-label-short">Collection</span>
            <span className="nav-label-full">Collection</span>
          </button>
          <button
            className={`nav-btn${view === "transactions" ? " active" : ""}`}
            onClick={() => switchView("transactions")}
          >
            Transactions
            {orders.activeCount > 0 && (
              <span className="nav-badge">{orders.activeCount}</span>
            )}
          </button>
        </nav>
        <div className="header-overflow-container" ref={overflowMenuRef}>
          <button
            className="header-overflow-btn"
            onClick={() => setOverflowMenuOpen(o => !o)}
            aria-label="More options"
            aria-expanded={overflowMenuOpen}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
              <circle cx="9" cy="3" r="1.5" />
              <circle cx="9" cy="9" r="1.5" />
              <circle cx="9" cy="15" r="1.5" />
            </svg>
          </button>

          {overflowMenuOpen && (
            <div className="header-overflow-menu">
              <div className="overflow-menu-section">
                <ThemeToggle />
              </div>
              <div className="overflow-menu-divider" />
              <a
                className="overflow-menu-item"
                href="https://github.com/Kagaiodin/deck-checklist/issues/new?template=bug_report.md"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOverflowMenuOpen(false)}
              >
                <BugIcon />
                Report a bug
              </a>
              <a
                className="overflow-menu-item"
                href="https://github.com/Kagaiodin/deck-checklist/issues/new?template=feature_request.md"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOverflowMenuOpen(false)}
              >
                <LightbulbIcon />
                Request a feature
              </a>
              {!demoActive && (
                <>
                  <div className="overflow-menu-divider" style={{ marginTop: 6 }} />
                  <DemoMenuItem onSelect={() => { setOverflowMenuOpen(false); requestSampleData(); }} />
                </>
              )}
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
                    <span className="deck-picker-title">Decks</span>
                    <button className="deck-picker-close" onClick={() => setDeckPickerOpen(false)}>✕</button>
                  </div>
                  <ul className="deck-picker-list">
                    {state.decks.length === 0 ? (
                      <li className="deck-picker-empty">No decks yet — import one to get started.</li>
                    ) : state.decks.map(deck => {
                      const totalCards = deck.cards.reduce((s, c) => s + c.quantity, 0);
                      const acquiredCards = deck.cards.filter(c => c.acquired).reduce((s, c) => s + c.quantity, 0);
                      const pct = totalCards > 0 ? Math.round((acquiredCards / totalCards) * 100) : 0;
                      const isComplete = totalCards > 0 && acquiredCards === totalCards;
                      const colors = getDeckColorIdentity(deck);
                      return (
                        <li
                          key={deck.id}
                          className={`deck-item${activeDeckId === deck.id ? " active" : ""}`}
                          onClick={() => { setActiveDeckId(deck.id); setDeckPickerOpen(false); }}
                        >
                          <div className="deck-item-info">
                            <div className="deck-item-top">
                              <span className="deck-item-name">{deck.name}</span>
                              <span className={`deck-item-pct${isComplete ? " complete" : ""}`}>{isComplete ? "✓" : `${pct}%`}</span>
                            </div>
                            <div className="deck-item-meta">
                              {colors.length > 0 && (
                                <span className="deck-color-dots">
                                  {colors.map(c => <span key={c} className={`deck-color-dot clr-${c.toLowerCase()}`} />)}
                                </span>
                              )}
                              <span className="deck-item-card-count">{totalCards} cards</span>
                              {deck.isBuilt && (
                                unmarkingBuiltDeckId === deck.id ? (
                                  <span className="deck-built-confirm" onClick={e => e.stopPropagation()}>
                                    <span className="deck-built-confirm-label">Unmark?</span>
                                    <button className="deck-built-confirm-yes" onClick={() => { handleToggleDeckBuilt(deck.id); setUnmarkingBuiltDeckId(null); }}>Yes</button>
                                    <button className="deck-built-confirm-no" onClick={() => setUnmarkingBuiltDeckId(null)}>No</button>
                                  </span>
                                ) : (
                                  <button
                                    className="deck-built-badge is-built"
                                    onClick={e => { e.stopPropagation(); setUnmarkingBuiltDeckId(deck.id); }}
                                    title="Unmark as built"
                                  >Built</button>
                                )
                              )}
                            </div>
                            <div className="deck-item-bar-track">
                              <div className={`deck-item-bar-fill${isComplete ? " complete" : ""}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                          <button
                            className="deck-delete-btn"
                            onClick={e => { e.stopPropagation(); handleDeleteDeck(deck.id); }}
                            title="Delete deck"
                          >×</button>
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
                    <button
                      className="btn btn-ghost"
                      style={{ width: "100%" }}
                      onClick={() => { setDeckPickerOpen(false); handleCreateBlankDeck(); }}
                    >
                      + Create blank deck
                    </button>
                    <div className="deck-picker-export-row">
                      <button className="btn btn-ghost btn-sm" disabled={demoActive} onClick={() => {
                        // Export is fire-and-forget — no need to close the sheet
                        void exportBackup(showToast);
                      }}>↓ Export backup</button>
                      <button
                        className={`btn btn-ghost btn-sm${importPanelOpen ? " active" : ""}`}
                        disabled={demoActive}
                        onClick={() => setImportPanelOpen(v => !v)}
                      >↑ Import backup</button>
                    </div>
                    {demoActive && <p className="demo-backup-hint">{DEMO_BACKUP_HINT}</p>}
                    <GoogleDriveBackup showToast={showToast} variant="mobile" />
                  </div>
                </div>
              </div>
            )}

            <aside className={`deck-sidebar${sidebarOpen ? "" : " sidebar-collapsed"}`}>
              {/* ── Top: label + collapse toggle ── */}
              <div className="sidebar-top">
                <span className="sidebar-label">Decks</span>
                <button
                  className="collapse-btn"
                  onClick={() => setSidebarOpen(o => !o)}
                  aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                  title="Toggle sidebar (⌘B)"
                >
                  <svg
                    className={`sidebar-chevron${sidebarOpen ? "" : " rotated"}`}
                    width="14" height="14" viewBox="0 0 14 14" fill="none"
                    aria-hidden="true"
                  >
                    <path d="M9 2.5L4.5 7L9 11.5" stroke="currentColor" strokeWidth="1.6"
                          strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>

              {/* ── Search + New button — hidden in rail mode ── */}
              <div className="sidebar-search-row">
                <input
                  className="sidebar-search"
                  placeholder="Filter decks…"
                  value={sidebarSearch}
                  onChange={e => setSidebarSearch(e.target.value)}
                />
                <button className="btn btn-primary btn-sm" onClick={() => setShowImport(v => !v)}>
                  {showImport ? "✕" : "+ New"}
                </button>
              </div>

              {/* ── Scrollable deck list — always rendered for rail ── */}
              <div className="sidebar-scroll">
                {state.decks.length === 0 ? (
                  <p className="sidebar-empty">No decks yet.</p>
                ) : filteredDecks.length === 0 ? (
                  <p className="sidebar-empty">No match.</p>
                ) : (
                  <ul className="deck-list">
                    {filteredDecks.map(deck => {
                      const totalCards = deck.cards.reduce((s, c) => s + c.quantity, 0);
                      const acquiredCards = deck.cards.filter(c => c.acquired).reduce((s, c) => s + c.quantity, 0);
                      const pct = totalCards > 0 ? Math.round((acquiredCards / totalCards) * 100) : 0;
                      const isComplete = totalCards > 0 && acquiredCards === totalCards;
                      const initials = deck.name.replace(/^(Cmdr|EDH|Commander)[:–-]\s*/i, "").charAt(0).toUpperCase();
                      const colors = getDeckColorIdentity(deck);
                      const isDeleting = deletingDeckId === deck.id;
                      return (
                        <li
                          key={deck.id}
                          className={`deck-item${activeDeckId === deck.id ? " active" : ""}${isDeleting ? " confirming-delete" : ""}`}
                          onClick={() => { if (!isDeleting) setActiveDeckId(deck.id); }}
                          title={!sidebarOpen ? `${deck.name} · ${acquiredCards}/${totalCards} cards` : undefined}
                        >
                          {/* Avatar — always visible on rail */}
                          <div className="deck-av">
                            {initials}
                            <div className={`deck-av-dot${isComplete ? " done" : ""}`} />
                          </div>
                          {/* Info — fades out on rail */}
                          <div className="deck-info">
                            <div className="deck-item-top">
                              <span className="deck-item-name">{deck.name}</span>
                              <span className={`deck-item-pct${isComplete ? " complete" : ""}`}>
                                {isComplete ? "✓" : `${pct}%`}
                              </span>
                            </div>
                            <div className="deck-item-meta">
                              {colors.length > 0 && (
                                <span className="deck-color-dots">
                                  {colors.map(c => <span key={c} className={`deck-color-dot clr-${c.toLowerCase()}`} />)}
                                </span>
                              )}
                              {deck.format && <span className="deck-format-pill">{deck.format.toUpperCase()}</span>}
                              <span className="deck-item-card-count">· {totalCards} cards</span>
                              {unmarkingBuiltDeckId === deck.id ? (
                                <span className="deck-built-confirm" onClick={e => e.stopPropagation()}>
                                  <span className="deck-built-confirm-label">Unmark?</span>
                                  <button className="deck-built-confirm-yes" onClick={() => { handleToggleDeckBuilt(deck.id); setUnmarkingBuiltDeckId(null); }}>Yes</button>
                                  <button className="deck-built-confirm-no" onClick={() => setUnmarkingBuiltDeckId(null)}>No</button>
                                </span>
                              ) : (
                                <button
                                  className={`deck-built-badge${deck.isBuilt ? " is-built" : ""}`}
                                  onClick={e => { e.stopPropagation(); if (deck.isBuilt) setUnmarkingBuiltDeckId(deck.id); else handleToggleDeckBuilt(deck.id); }}
                                  title={deck.isBuilt ? "Unmark as built" : "Mark as built"}
                                >Built</button>
                              )}
                            </div>
                            <div className="deck-item-bar-track">
                              <div className={`deck-item-bar-fill${isComplete ? " complete" : ""}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                          {isDeleting ? (
                            <div className="deck-delete-confirm" onClick={e => e.stopPropagation()}>
                              <span className="deck-delete-confirm-label">Delete?</span>
                              <button className="deck-delete-yes" onClick={() => { handleDeleteDeck(deck.id); setDeletingDeckId(null); }}>Yes</button>
                              <button className="deck-delete-no" onClick={() => setDeletingDeckId(null)}>No</button>
                            </div>
                          ) : (
                            <button
                              className="deck-delete-btn"
                              onClick={e => { e.stopPropagation(); setDeletingDeckId(deck.id); }}
                              title="Delete deck"
                            >×</button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* ── Footer ── */}
              <div className="sidebar-footer">
                <button
                  className="new-deck-btn"
                  onClick={() => setShowImport(true)}
                  title="New deck"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </button>
                <div className="sidebar-backup">
                  <BackupControls
                    showToast={showToast}
                    importPanelOpen={importPanelOpen}
                    onToggleImportPanel={() => setImportPanelOpen(v => !v)}
                  />
                </div>
              </div>
            </aside>

            <div className="deck-content">
              {/* ── Import panel ─────────────────────────────────────────── */}
              {showImport && <DeckImportPanel draft={importDraft} setDraft={setImportDraft} onImported={handleDeckImported} onCancel={() => setShowImport(false)} />}

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

              {!showImport && activeDeck ? (
                <>
                  <div className="deck-content-header">
                    {renamingDeckId === activeDeck.id ? (
                      <form className="rename-form" onSubmit={e => { e.preventDefault(); commitRename(); }}>
                        <input
                          className="rename-input"
                          aria-label="Deck name"
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={commitRename}
                          autoFocus
                        />
                        <button type="submit" className="btn btn-primary btn-sm">Save</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenamingDeckId(null)}>Cancel</button>
                      </form>
                    ) : (
                      <>
                        <div className="deck-title-row">
                          <div className="deck-title-wrap">
                            <h2 className="deck-content-title">{activeDeck.name}</h2>
                            <button className="rename-btn" onClick={() => startRename(activeDeck)}>Rename</button>
                          </div>
                          <div className="deck-header-actions">
                            {/* Export dropdown */}
                            <div className="actions-menu-container" ref={actionsMenuRef}>
                              <button
                                className={`btn btn-secondary btn-sm${actionsOpen ? " active" : ""}`}
                                onClick={() => setActionsOpen(o => !o)}
                              >
                                Export ▾
                              </button>
                              {actionsOpen && (
                                <div className="actions-dropdown">
                                  <div className="actions-section-label">Missing cards</div>
                                  <button className="actions-item" onClick={() => { handleExportMissing(); setActionsOpen(false); }}>
                                    Export missing list
                                  </button>
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
                                </div>
                              )}
                            </div>

                            {/* Buy list / Bulk tag / Edit / Done */}
                            {(editMode || selectMode) ? (
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => { setEditMode(false); setSelectMode(false); }}
                              >
                                Done
                              </button>
                            ) : (
                              <>
                                {toBuyTotal > 0 && (
                                  <button
                                    className="btn btn-secondary btn-sm buy-list-btn"
                                    onClick={buyFlow.openBuySheet}
                                  >
                                    <span className="buy-btn-full">Buy list</span>
                                    <span className="buy-btn-short">Buy</span>
                                    <span className="buy-list-badge">{toBuyTotal}</span>
                                  </button>
                                )}
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => setSelectMode(true)}
                                >
                                  Bulk tag
                                </button>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => setEditMode(true)}
                                >
                                  Edit
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="deck-meta-line">
                          {(() => {
                            const colors = getDeckColorIdentity(activeDeck);
                            return colors.length > 0 ? (
                              <span className="deck-meta-colors">
                                {colors.map(c => <span key={c} className={`deck-meta-color clr-${c.toLowerCase()}`} />)}
                              </span>
                            ) : null;
                          })()}
                          {editingFormatId === activeDeck.id ? (
                            <form
                              className="format-edit-form"
                              onSubmit={e => { e.preventDefault(); commitFormat(); }}
                            >
                              <select
                                className="format-edit-input"
                                aria-label="Deck format"
                                value={formatDraft}
                                onChange={e => setFormatDraft(e.target.value)}
                                onBlur={commitFormat}
                                autoFocus
                              >
                                <option value="">No format</option>
                                {formatOptions(activeDeck.format).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                              </select>
                            </form>
                          ) : (
                            <button
                              className={`deck-format-meta${activeDeck.format ? " has-format" : ""}`}
                              onClick={() => startEditFormat(activeDeck)}
                              title="Click to set format"
                            >
                              {activeDeck.format ? activeDeck.format.toUpperCase() : "+ format"}
                            </button>
                          )}
                          <span className="deck-meta-sep" data-contrast-exempt>·</span>
                          <span className="deck-meta-stat">{activeDeck.cards.reduce((s, c) => s + c.quantity, 0)} cards</span>
                          <span className="deck-meta-sep" data-contrast-exempt>·</span>
                          <span className="deck-meta-stat">imported {formatRelativeDate(activeDeck.createdAt)}</span>
                          {activeDeck.url && (
                            <>
                              <span className="deck-meta-sep" data-contrast-exempt>·</span>
                              <a
                                href={activeDeck.url.startsWith("http") ? activeDeck.url : `https://${activeDeck.url}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="deck-meta-link"
                              >
                                {getDeckDomain(activeDeck.url)} ↗
                              </a>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <ErrorQueue
                    errors={errors}
                    onRemap={handleRemap}
                    onDismiss={handleDismiss}
                  />
                  {/* Deck notifications (e.g. order cancellation) */}
                  {(activeDeck.notifications ?? []).map(notification => (
                    <div key={notification.id} className="deck-notification-banner">
                      <div className="deck-notification-content">
                        <span className="deck-notification-icon">⚠️</span>
                        <div className="deck-notification-text">
                          <strong>{notification.orderLabel}</strong> was cancelled.{" "}
                          {notification.affectedCardIds.length} card{notification.affectedCardIds.length !== 1 ? "s" : ""} have been untagged — review and retag as needed.
                        </div>
                      </div>
                      <div className="deck-notification-actions">
                        {notificationFilterIds ? (
                          <button className="btn btn-ghost btn-sm" onClick={() => setNotificationFilterIds(null)}>
                            Show all
                          </button>
                        ) : (
                          <button className="btn btn-secondary btn-sm" onClick={() => setNotificationFilterIds(notification.affectedCardIds)}>
                            Show cards
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDismissNotification(activeDeck.id, notification.id)}>
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                  <Checklist
                    deck={activeDeck}
                    editMode={editMode}
                    selectMode={selectMode}
                    onToggleAcquired={handleToggleAcquired}
                    onSetSource={handleSetSource}
                    onBulkSetSource={handleBulkSetSource}
                    onRemoveCard={handleRemoveCard}
                    onToggleCommander={handleToggleCommander}
                    onDismissCommanderPrompt={handleDismissCommanderPrompt}
                    onUpdateQuantity={handleUpdateQuantity}
                    onAddCard={handleAddCard}
                    filterCardIds={notificationFilterIds ?? undefined}
                    isEnrichmentLoading={enrichingDeckIds.has(activeDeck.id)}
                    isPricesLoading={pricingDeckIds.has(activeDeck.id)}
                  />
                </>
              ) : state.decks.length === 0 && !showImport ? (
                <div className="deck-empty-cta-wrap">
                  <EmptyState
                    icon={
                      <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                        <rect x="6" y="4" width="20" height="24" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M11 12h10M11 16h7M11 20h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <circle cx="24" cy="24" r="5" fill="var(--surface)" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M22 24h4M24 22v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    }
                    title="No decks yet"
                    body="Import a decklist from Moxfield, MTGO, or Arena to start tracking your missing cards."
                    primary={{
                      label: (
                        <>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2v9M4 8l4 4 4-4M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          Import a deck
                        </>
                      ),
                      onClick: () => setShowImport(true),
                    }}
                    secondary={{
                      label: "Create blank deck",
                      onClick: handleCreateBlankDeck,
                    }}
                  />
                </div>
              ) : !showImport ? (
                <div className="empty-state centered">
                  <EmptyState
                    icon={
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="3" width="14" height="18" rx="2"/>
                        <path d="M9 8h6M9 12h4"/>
                        <path d="M9 16.5l1.8 1.8L14.5 14"/>
                      </svg>
                    }
                    title="Pick a deck"
                    body={
                      <>
                        <span className="empty-copy-desktop">Choose a deck from the list on the left to see its fetch list.</span>
                        <span className="empty-copy-mobile">Choose a deck above to see its fetch list.</span>
                      </>
                    }
                    secondary={{ label: "+ Import another deck", onClick: () => setShowImport(true) }}
                  />
                  <div className="empty-mobile-primary">
                    <button className="btn btn-primary" onClick={() => setDeckPickerOpen(true)}>Choose a deck</button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* ── Collection tab ─────────────────────────────────────────────── */}
        {view === "collection" && (
          <CollectionPage
            decks={state.decks}
            onOpenTrade={() => openTrade("collection")}
          />
        )}
        {/* ── Transactions tab (Buys · Trades & sales · Binder, or the Calculator) ── */}
        {view === "transactions" && (
          tradeOpen ? (
            <TradePage
              key={tradeKey}
              collection={collection}
              decks={state.decks}
              origin={tradeOrigin}
              seed={tradeSeed}
              onLogTrade={logTrade}
              onViewEntry={viewLedgerEntry}
              onBack={leaveTrade}
            />
          ) : (
            <TransactionsPage
              subTab={txSubTab}
              onSubTabChange={setTxSubTab}
              collection={collection}
              onOpenTrade={seed => openTrade(txSubTab === "trades" ? "trades" : "binder", seed)}
              onViewCollection={() => switchView("collection")}
              ledger={ledger}
              onDeleteLedgerEntry={deleteLedgerEntry}
              ledgerOpenId={ledgerOpenId}
              onLedgerOpenChange={setLedgerOpenId}
              ordersProps={{
                orders: orders.orders,
                decks: state.decks,
                recentVendors: orders.recentVendors,
                onCreateOrder: orders.create,
                onUpdateOrder: orders.update,
                onMarkReceived: orders.receive,
                onMarkCancelled: orders.cancel,
                onDeleteOrder: orders.remove,
                onOpenBuyList: () => buyFlow.openBuySheet(),
              }}
            />
          )
        )}

      </main>

      {/* ── Buy list sheet ────────────────────────────────────────────────── */}
      <BuyListSheet
        isOpen={buyFlow.buySheetOpen}
        cards={toBuyCards}
        selectedVendorId={buyFlow.selectedVendorId}
        vendorPickerOpen={buyFlow.vendorPickerOpen}
        vendorLastUsed={buyFlow.getVendorLastUsedMap()}
        sendState={buyFlow.sendState}
        errorType={buyFlow.errorType}
        sendUrl={buyFlow.sendUrl}
        clipboardText={buyFlow.clipboardText}
        createdOrderId={buyFlow.createdOrderId}
        onClose={buyFlow.closeBuySheet}
        onOpenVendorPicker={buyFlow.openVendorPicker}
        onCloseVendorPicker={buyFlow.closeVendorPicker}
        onConfirmVendor={buyFlow.confirmVendor}
        onSend={(vendorId) => void buyFlow.handleSend(vendorId)}
        onRetrySend={(vendorId) => { buyFlow.resetSendState(); void buyFlow.handleSend(vendorId); }}
        onViewOrder={buyFlow.onViewOrder}
      />
    </div>
  );
}

export default function App() {
  return (
    <DeckProvider>
      <AppInner />
    </DeckProvider>
  );
}
