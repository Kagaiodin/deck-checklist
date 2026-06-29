import { useState, useEffect, useRef } from "react";
import "./tokens.css";
import "./App.css";
import { DeckProvider, useDecks } from "./store/decks";
import { parseDecklist } from "./utils/parser";
import { validateDecklist, enrichDeckExtraInfo } from "./utils/validator";
import type { ValidationProgress } from "./utils/validator";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { Checklist } from "./components/Checklist";
import { ErrorQueue } from "./components/ErrorQueue";
import { ProgressTracker } from "./components/ProgressTracker";
import type { Deck, ErrorQueueItem, AcquisitionSource, Collection, CollectionMeta, Order, DeckNotification, ProfileExport } from "./types/index";
import { applyCollectionToCards, mergeOrderCardsIntoCollection } from "./utils/csvParser";
import { getDeckColorIdentity, formatRelativeDate, getDeckDomain } from "./utils/deckUtils";
import { CollectionPage } from "./features/collection/CollectionPage";
import { OrdersPage } from "./features/orders/OrdersPage";
import { OnboardingModal } from "./features/onboarding/OnboardingModal";
import { ProfileExportImport } from "./features/profile/ProfileExportImport";
import { ThemeToggle } from "./components/ThemeToggle";
import { AppLogo } from "./components/AppLogo";
import type { ToastInput } from "./features/profile/ProfileExportImport";
import { BuyListSheet } from "./features/card-purchase/BuyListSheet";
import { useBuyFlow } from "./features/card-purchase/useBuyFlow";
import "./features/card-purchase/buy-flow.css";

// ── Order row helpers ──────────────────────────────────────────────────────────

function orderLabelForNotification(order: Order): string {
  const d = order.orderDate
    ? new Date(order.orderDate).toLocaleDateString("en-US", { month: "long", day: "numeric" })
    : "";
  return d ? `${order.vendor} — ${d}` : order.vendor;
}

const ONBOARDING_KEY = "fetchlist:onboarding:dismissed";

function AppInner() {
  const { state, dispatch } = useDecks();
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [deckName, setDeckName] = useState("");
  const [deckUrl, setDeckUrl] = useState("");
  const [deckFormat, setDeckFormat] = useState("");
  const [importAsBuilt, setImportAsBuilt] = useState(false);
  const [allErrors, setAllErrors] = useLocalStorage<Record<string, ErrorQueueItem[]>>("mtg-checklist-errors", {});
  const [validating, setValidating] = useState(false);
  const [progress, setProgress] = useState<ValidationProgress>({ total: 0, validated: 0 });
  const [importError, setImportError] = useState<string | null>(null);
  const [view, setView] = useState<"decks" | "collection" | "orders">("decks");
  const [showImport, setShowImport] = useState(false);
  const [renamingDeckId, setRenamingDeckId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try { return localStorage.getItem("fl-sidebar-collapsed") !== "true"; }
    catch { return true; }
  });
  const [archidektFetching, setArchidektFetching] = useState(false);
  const [archidektError, setArchidektError] = useState<string | null>(null);
  const [showFormats, setShowFormats] = useState(false);
  const [deckPickerOpen, setDeckPickerOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [deletingDeckId, setDeletingDeckId] = useState<string | null>(null);
  const [unmarkingBuiltDeckId, setUnmarkingBuiltDeckId] = useState<string | null>(null);
  const [editingFormatId, setEditingFormatId] = useState<string | null>(null);
  const [formatDraft, setFormatDraft] = useState("");
  const [enrichingDeckIds, setEnrichingDeckIds] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // ── Sidebar persistence + keyboard shortcut ───────────────────────────────
  useEffect(() => {
    try { localStorage.setItem("fl-sidebar-collapsed", sidebarOpen ? "false" : "true"); }
    catch {}
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
  const [onboardingDismissed, setOnboardingDismissed] = useLocalStorage<boolean>(ONBOARDING_KEY, false);
  const showOnboarding = state.decks.length === 0 && !onboardingDismissed;

  function dismissOnboarding() {
    setOnboardingDismissed(true);
  }

  function handleOnboardingImport() {
    setOnboardingDismissed(true);
    setShowImport(true);
  }

  // ── Collection (read-only, for auto-tagging on deck import) ──────────────
  // CollectionPage owns all writes; AppInner only reads + writes when receiving orders.
  const [collection, setCollection] = useLocalStorage<Collection>("mtg-checklist-collection-v2", {});
  const [collectionMeta, setCollectionMeta] = useLocalStorage<CollectionMeta | null>("mtg-checklist-collection-meta-v2", null);

  // ── Orders state ──────────────────────────────────────────────────────────
  const [orders, setOrders] = useLocalStorage<Order[]>("mtg-checklist-orders-v1", []);
  const [recentVendors, setRecentVendors] = useLocalStorage<string[]>("mtg-checklist-vendor-history", []);
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

  // ── Profile export/import panel state (shared across sidebar + mobile sheet) ──
  const [importPanelOpen, setImportPanelOpen] = useState(false);



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
      const collectionTagged = Object.keys(collection).length > 0
        ? applyCollectionToCards(result.cards, collection)
        : result.cards;

      const taggedCards = importAsBuilt
        ? collectionTagged.map(c => ({
            ...c,
            acquired: true,
            source: ((c.manuallyTagged && c.source === "proxy") ? "proxy" : "owned") as AcquisitionSource,
            manuallyTagged: true,
          }))
        : collectionTagged;

      const id = crypto.randomUUID();
      const name = deckName.trim() || `Deck ${state.decks.length + 1}`;
      const deck: Deck = {
        id,
        name,
        url: deckUrl.trim() || undefined,
        format: deckFormat.trim() || undefined,
        cards: taggedCards,
        createdAt: Date.now(),
        isBuilt: importAsBuilt || undefined,
      };

      dispatch({ type: "ADD_DECK", payload: deck });
      setAllErrors(prev => ({ ...prev, [id]: result.errors }));
      setActiveDeckId(id);

      // Fire-and-forget enrichment (tokens + alt printings)
      setEnrichingDeckIds(prev => new Set(prev).add(id));
      enrichDeckExtraInfo(taggedCards).then(extraInfo => {
        dispatch({ type: "SET_EXTRA_INFO", payload: { deckId: id, extraInfo } });
      }).finally(() => {
        setEnrichingDeckIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      });
      setImportText("");
      setDeckName("");
      setDeckUrl("");
      setDeckFormat("");
      setImportAsBuilt(false);
      setShowImport(false);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Validation failed. Please try again.");
    } finally {
      setValidating(false);
    }
  }

  function handleToggleDeckBuilt(deckId: string) {
    const deck = state.decks.find(d => d.id === deckId);
    dispatch({ type: "TOGGLE_DECK_BUILT", payload: deckId });
    if (!deck) return;
    if (!deck.isBuilt) {
      // Marking as built — set all cards to acquired + owned
      dispatch({
        type: "SET_CARDS",
        payload: {
          deckId,
          cards: deck.cards.map(c => ({
            ...c,
            acquired: true,
            source: ((c.manuallyTagged && c.source === "proxy") ? "proxy" : "owned") as AcquisitionSource,
            manuallyTagged: true,
          })),
        },
      });
    } else {
      // Unmarking as built — clear checkboxes and re-apply collection tagging
      const reset = deck.cards.map(c => ({ ...c, acquired: false, source: undefined, manuallyTagged: false }));
      const retagged = Object.keys(collection).length > 0
        ? applyCollectionToCards(reset, collection)
        : reset;
      dispatch({ type: "SET_CARDS", payload: { deckId, cards: retagged } });
    }
  }

  function handleToggleAcquired(cardId: string) {
    if (!activeDeckId) return;
    dispatch({ type: "TOGGLE_ACQUIRED", payload: { deckId: activeDeckId, cardId } });

    // Auto-mark as built when the last card is checked off
    const deck = state.decks.find(d => d.id === activeDeckId);
    if (deck && !deck.isBuilt) {
      const card = deck.cards.find(c => c.id === cardId);
      if (card && !card.acquired) {
        const allOthersAcquired = deck.cards.every(c => c.id === cardId || c.acquired);
        if (allOthersAcquired && deck.cards.length > 0) {
          dispatch({ type: "TOGGLE_DECK_BUILT", payload: activeDeckId });
        }
      }
    }
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

  // ── Order handlers ────────────────────────────────────────────────────────
  function handleCreateOrder(order: Order, vendor: string) {
    setOrders(prev => [order, ...prev]);
    setRecentVendors(prev => {
      const next = [vendor, ...prev.filter(v => v.toLowerCase() !== vendor.toLowerCase())];
      return next.slice(0, 6);
    });
  }

  function handleDeleteOrder(id: string) {
    setOrders(prev => prev.filter(o => o.id !== id));
  }

  function handleUpdateOrder(updated: Order) {
    setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
  }

  function handleMarkReceived(orderId: string) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // Update order status
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "received" as const } : o));

    // Tag deck-linked cards as "owned" (manuallyTagged so collection won't overwrite)
    const cardsByDeck = new Map<string, string[]>();
    for (const oc of order.cards) {
      if (oc.deckId && oc.cardId) {
        cardsByDeck.set(oc.deckId, [...(cardsByDeck.get(oc.deckId) ?? []), oc.cardId]);
      }
    }
    for (const [deckId, cardIds] of cardsByDeck) {
      dispatch({ type: "BULK_SET_SOURCE", payload: { deckId, cardIds, source: "owned" } });
    }

    // Merge into collection (Option A: quantity only, no set/CN)
    const updatedCollection = mergeOrderCardsIntoCollection(order.cards, collection);
    setCollection(updatedCollection);
    setCollectionMeta(prev => prev
      ? { ...prev, cardCount: Object.keys(updatedCollection).length }
      : { fileName: "Order receipt", importedAt: Date.now(), cardCount: Object.keys(updatedCollection).length }
    );
    dispatch({ type: "APPLY_COLLECTION", payload: updatedCollection });
  }

  function handleMarkCancelled(orderId: string) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // Update order status
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "cancelled" as const } : o));

    // Unset source + manuallyTagged on deck-linked cards so collection can re-tag
    const cardsByDeck = new Map<string, string[]>();
    for (const oc of order.cards) {
      if (oc.deckId && oc.cardId) {
        cardsByDeck.set(oc.deckId, [...(cardsByDeck.get(oc.deckId) ?? []), oc.cardId]);
      }
    }
    for (const [deckId, cardIds] of cardsByDeck) {
      dispatch({ type: "UNSET_CARD_SOURCES", payload: { deckId, cardIds } });
    }

    // Re-apply collection now that manuallyTagged is cleared
    if (Object.keys(collection).length > 0) {
      dispatch({ type: "APPLY_COLLECTION", payload: collection });
    }

    // Add deck notifications so user knows which cards to review
    const label = orderLabelForNotification(order);
    for (const [deckId, cardIds] of cardsByDeck) {
      const notification: DeckNotification = {
        id: `${orderId}_${deckId}`,
        type: "order_cancelled",
        orderId,
        orderLabel: label,
        affectedCardIds: cardIds,
        createdAt: Date.now(),
      };
      dispatch({ type: "ADD_NOTIFICATION", payload: { deckId, notification } });
    }
  }

  function handleDismissNotification(deckId: string, notificationId: string) {
    dispatch({ type: "DISMISS_NOTIFICATION", payload: { deckId, notificationId } });
    setNotificationFilterIds(null);
  }

  // ── Profile export / import ───────────────────────────────────────────────
  function handleProfileImport(data: ProfileExport, replace: boolean) {
    if (replace) {
      // Replace mode — wipe all and restore from backup
      dispatch({ type: "SET_DECKS", payload: data.decks ?? [] });
      setAllErrors(data.errors ?? {});
      setCollection(data.collection ?? {});
      setCollectionMeta(data.collectionMeta ?? null);
      setOrders(data.orders ?? []);
      setRecentVendors((data.vendorHistory ?? []).slice(0, 50));
      return { newDecks: (data.decks ?? []).length, newCards: Object.keys(data.collection ?? {}).length, newOrders: (data.orders ?? []).length };
    }

    // Merge mode — only add net-new items
    const existingDeckIds = new Set(state.decks.map(d => d.id));
    const newDecks = (data.decks ?? []).filter(d => !existingDeckIds.has(d.id));
    for (const deck of newDecks) dispatch({ type: "ADD_DECK", payload: deck });

    // Errors — adopt by deck id if not already present
    const mergedErrors = { ...allErrors };
    for (const [id, items] of Object.entries(data.errors ?? {})) {
      if (!mergedErrors[id]) mergedErrors[id] = items;
    }
    setAllErrors(mergedErrors);

    // Collection — union printings per card name, deduping by set+collectorNumber+foil
    const mergedCollection = { ...collection };
    let newCardKeyCount = 0;
    for (const [name, printings] of Object.entries(data.collection ?? {})) {
      const existing = mergedCollection[name] ?? [];
      if (existing.length === 0) newCardKeyCount++;
      const deduped = [...existing];
      for (const p of printings) {
        const isDup = deduped.some(
          e => e.set === p.set && e.collectorNumber === p.collectorNumber && (e.foil ?? false) === (p.foil ?? false)
        );
        if (!isDup) deduped.push(p);
      }
      mergedCollection[name] = deduped;
    }
    setCollection(mergedCollection);

    // CollectionMeta — adopt if local is null
    if (!collectionMeta && data.collectionMeta) setCollectionMeta(data.collectionMeta);

    // Orders — skip duplicates by id
    const existingOrderIds = new Set(orders.map(o => o.id));
    const newOrders = (data.orders ?? []).filter(o => !existingOrderIds.has(o.id));
    setOrders([...orders, ...newOrders]);

    // Vendor history — union, deduplicated, cap at 50
    const mergedVendors = [...new Set([...recentVendors, ...(data.vendorHistory ?? [])])].slice(0, 50);
    setRecentVendors(mergedVendors);

    return { newDecks: newDecks.length, newCards: newCardKeyCount, newOrders: newOrders.length };
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

  function switchView(v: "decks" | "collection" | "orders") {
    setView(v);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  const buyFlow = useBuyFlow({
    toBuyCards,
    deckId: activeDeckId,
    onCreateOrder: (order) => setOrders(prev => [order, ...prev]),
    onViewOrder: () => switchView("orders"),
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

  const hasFormats = filteredDecks.some(d => d.format);
  const deckGroups: { label: string; decks: typeof filteredDecks }[] = hasFormats
    ? (() => {
        const map = new Map<string, typeof filteredDecks>();
        for (const deck of filteredDecks) {
          const key = deck.format ? deck.format.toUpperCase() : "Other";
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(deck);
        }
        const groups = Array.from(map.entries()).map(([label, decks]) => ({ label, decks }));
        const other = groups.find(g => g.label === "Other");
        const rest = groups.filter(g => g.label !== "Other").sort((a, b) => a.label.localeCompare(b.label));
        return other ? [...rest, other] : rest;
      })()
    : [{ label: "", decks: filteredDecks }];

  function toggleGroup(label: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }

  return (
    <div className="app">
      {/* ── First-run onboarding modal ────────────────────────────────────── */}
      {showOnboarding && (
        <OnboardingModal
          onDismiss={dismissOnboarding}
          onImportDeck={handleOnboardingImport}
        />
      )}
      {/* ── Toast container ───────────────────────────────────────────────── */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast${t.variant === "warn" ? " toast--warn" : t.variant === "neutral" ? " toast--neutral" : ""}`}>
            <div className="toast-body">
              <div className="toast-title">{t.title}</div>
              {t.sub && <div className="toast-sub">{t.sub}</div>}
            </div>
            <button className="toast-close" onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>×</button>
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
            className={`nav-btn${view === "orders" ? " active" : ""}`}
            onClick={() => switchView("orders")}
          >
            Orders
            {orders.filter(o => o.status === "active").length > 0 && (
              <span className="nav-badge">{orders.filter(o => o.status === "active").length}</span>
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
                🐛 Report a bug
              </a>
              <a
                className="overflow-menu-item"
                href="https://github.com/Kagaiodin/deck-checklist/issues/new?template=feature_request.md"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOverflowMenuOpen(false)}
              >
                ✨ Request a feature
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
                    <div className="deck-picker-export-row">
                      <button className="btn btn-ghost btn-sm" onClick={() => {
                        // Export is fire-and-forget — no need to close the sheet
                        const filename = `fetchlist-backup-${new Date().toISOString().slice(0, 10)}.json`;
                        const payload: ProfileExport = {
                          version: 1, exportedAt: new Date().toISOString(),
                          decks: state.decks, errors: allErrors,
                          collection, collectionMeta, orders, vendorHistory: recentVendors,
                        };
                        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        Object.assign(document.createElement("a"), { href: url, download: filename }).click();
                        URL.revokeObjectURL(url);
                        showToast({ title: "Profile exported", sub: filename, variant: "success", autoDismiss: 2000 });
                      }}>↓ Export backup</button>
                      <button
                        className={`btn btn-ghost btn-sm${importPanelOpen ? " active" : ""}`}
                        onClick={() => setImportPanelOpen(v => !v)}
                      >↑ Import backup</button>
                    </div>
                    {importPanelOpen && (
                      <ProfileExportImport
                        decks={state.decks}
                        allErrors={allErrors}
                        collection={collection}
                        collectionMeta={collectionMeta}
                        orders={orders}
                        vendorHistory={recentVendors}
                        onImport={handleProfileImport}
                        showToast={showToast}
                        importPanelOpen={importPanelOpen}
                        onToggleImportPanel={() => setImportPanelOpen(v => !v)}
                        hideFooter={true}
                      />
                    )}
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
                    {deckGroups.map(group => {
                      const isCollapsed = collapsedGroups.has(group.label);
                      return (
                        <li key={group.label || "__all__"} className="deck-group">
                          {group.label && (
                            <button
                              className={`deck-group-header${isCollapsed ? " collapsed" : ""}`}
                              onClick={() => toggleGroup(group.label)}
                            >
                              <span className="deck-group-chevron">{isCollapsed ? "▶" : "▼"}</span>
                              <span className="deck-group-label">{group.label}</span>
                              <span className="deck-group-count">{group.decks.length}</span>
                            </button>
                          )}
                          {!isCollapsed && group.decks.map(deck => {
                            const totalCards = deck.cards.reduce((s, c) => s + c.quantity, 0);
                            const acquiredCards = deck.cards.filter(c => c.acquired).reduce((s, c) => s + c.quantity, 0);
                            const pct = totalCards > 0 ? Math.round((acquiredCards / totalCards) * 100) : 0;
                            const isComplete = totalCards > 0 && acquiredCards === totalCards;
                            const initials = deck.name.replace(/^(Cmdr|EDH|Commander)[:–\-]\s*/i, "").charAt(0).toUpperCase();
                            const colors = getDeckColorIdentity(deck);
                            const isDeleting = deletingDeckId === deck.id;
                            return (
                              <div
                                key={deck.id}
                                className={`deck-item${activeDeckId === deck.id ? " active" : ""}${isDeleting ? " confirming-delete" : ""}${group.label ? " deck-item-grouped" : ""}`}
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
                                    {deck.format && !group.label && <span className="deck-format-pill">{deck.format.toUpperCase()}</span>}
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
                                        onClick={e => { e.stopPropagation(); deck.isBuilt ? setUnmarkingBuiltDeckId(deck.id) : handleToggleDeckBuilt(deck.id); }}
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
                              </div>
                            );
                          })}
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
                  <ProfileExportImport
                    decks={state.decks}
                    allErrors={allErrors}
                    collection={collection}
                    collectionMeta={collectionMeta}
                    orders={orders}
                    vendorHistory={recentVendors}
                    onImport={handleProfileImport}
                    showToast={showToast}
                    importPanelOpen={importPanelOpen}
                    onToggleImportPanel={() => setImportPanelOpen(v => !v)}
                  />
                </div>
              </div>
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
                  <div className="import-name-row">
                    <input
                      className="deck-name-input"
                      placeholder="Deck name (optional)"
                      value={deckName}
                      onChange={e => setDeckName(e.target.value)}
                      disabled={validating}
                    />
                    <input
                      className="deck-name-input deck-format-input"
                      placeholder="Format (e.g. Modern)"
                      value={deckFormat}
                      onChange={e => setDeckFormat(e.target.value)}
                      disabled={validating}
                    />
                  </div>
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

              {!showImport && activeDeck ? (
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
                              <input
                                className="format-edit-input"
                                value={formatDraft}
                                onChange={e => setFormatDraft(e.target.value)}
                                onBlur={commitFormat}
                                placeholder="Format…"
                                autoFocus
                              />
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
                          <span className="deck-meta-sep">·</span>
                          <span className="deck-meta-stat">{activeDeck.cards.reduce((s, c) => s + c.quantity, 0)} cards</span>
                          <span className="deck-meta-sep">·</span>
                          <span className="deck-meta-stat">imported {formatRelativeDate(activeDeck.createdAt)}</span>
                          {activeDeck.url && (
                            <>
                              <span className="deck-meta-sep">·</span>
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
                    onUpdateQuantity={handleUpdateQuantity}
                    onAddCard={handleAddCard}
                    filterCardIds={notificationFilterIds ?? undefined}
                    isEnrichmentLoading={enrichingDeckIds.has(activeDeck.id)}
                  />
                </>
              ) : state.decks.length === 0 && !showImport ? (
                <div className="deck-empty-cta-wrap">
                <div className="deck-empty-cta">
                  <div className="deck-empty-icon" aria-hidden="true">
                    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                      <rect x="6" y="4" width="20" height="24" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M11 12h10M11 16h7M11 20h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <circle cx="24" cy="24" r="5" fill="var(--surface)" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M22 24h4M24 22v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div>
                    <div className="deck-empty-headline">No decks yet</div>
                    <p className="deck-empty-body">Import a decklist from Moxfield, MTGO, or Arena to start tracking your missing cards.</p>
                  </div>
                  <div className="deck-empty-actions">
                    <button className="btn btn-primary deck-empty-btn-import" onClick={() => setShowImport(true)}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2v9M4 8l4 4 4-4M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Import a deck
                    </button>
                    <button className="deck-empty-btn-blank" onClick={() => {
                      const id = crypto.randomUUID();
                      dispatch({ type: "ADD_DECK", payload: { id, name: "New deck", cards: [], createdAt: Date.now() } });
                      setActiveDeckId(id);
                    }}>
                      or create a blank deck
                    </button>
                  </div>
                </div>
                </div>
              ) : !showImport ? (
                <div className="empty-state centered">
                  <p>Select a deck from the sidebar.</p>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* ── Collection tab ─────────────────────────────────────────────── */}
        {view === "collection" && (
          <CollectionPage
            decks={state.decks}
            onCollectionChange={updated => dispatch({ type: "APPLY_COLLECTION", payload: updated })}
          />
        )}
        {/* ── Orders tab ─────────────────────────────────────────────────── */}
        {view === "orders" && (
          <OrdersPage
            orders={orders}
            decks={state.decks}
            recentVendors={recentVendors}
            onCreateOrder={handleCreateOrder}
            onUpdateOrder={handleUpdateOrder}
            onMarkReceived={handleMarkReceived}
            onMarkCancelled={handleMarkCancelled}
            onDeleteOrder={handleDeleteOrder}
            onOpenBuyList={() => buyFlow.openBuySheet()}
          />
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
