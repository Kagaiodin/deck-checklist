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
import type { Deck, ErrorQueueItem, AcquisitionSource, Collection, CollectionMeta, Order, OrderCard, DeckNotification, Carrier, ProfileExport } from "./types/index";
import { applyCollectionToCards, mergeOrderCardsIntoCollection } from "./utils/csvParser";
import { detectCarrier, getTrackingUrl, CARRIER_NAMES } from "./utils/carrier";
import { getDeckColorIdentity, formatRelativeDate, getDeckDomain } from "./utils/deckUtils";
import { CollectionPage } from "./features/collection/CollectionPage";
import { OnboardingModal } from "./features/onboarding/OnboardingModal";
import { ProfileExportImport } from "./features/profile/ProfileExportImport";
import { ThemeToggle } from "./components/ThemeToggle";
import { AppLogo } from "./components/AppLogo";
import type { ToastInput } from "./features/profile/ProfileExportImport";
import { BuyListSheet } from "./features/card-purchase/BuyListSheet";
import { useBuyFlow } from "./features/card-purchase/useBuyFlow";
import "./features/card-purchase/buy-flow.css";

// ── Order row helpers ──────────────────────────────────────────────────────────

function formatShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatEtaMain(ts: number): string {
  const now = new Date();
  const eta = new Date(ts);
  const daysOut = Math.ceil((eta.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (daysOut === 0) return "Arrives today";
  if (daysOut === 1) return "Arrives tomorrow";
  if (daysOut <= 6) {
    const weekday = eta.toLocaleDateString(undefined, { weekday: "long" });
    return `Arrives ${weekday} · in ${daysOut} days`;
  }
  const md = eta.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `Arrives ${md} · in ${daysOut} days`;
}

function isUrgent(expectedArrival: number): boolean {
  const days = (expectedArrival - Date.now()) / (24 * 60 * 60 * 1000);
  return days >= 0 && days <= 1;
}

function daysOverdue(expectedArrival: number): number {
  return Math.ceil((Date.now() - expectedArrival) / (24 * 60 * 60 * 1000));
}

function totalCardQuantity(o: Order): number {
  return o.cards.reduce((sum, c) => sum + c.quantity, 0);
}

function affectedDeckCount(o: Order): number {
  const deckIds = new Set(o.cards.map(c => c.deckId).filter(Boolean));
  return deckIds.size;
}

const ONBOARDING_KEY = "fetchlist:onboarding:dismissed";

function AppInner() {
  const { state, dispatch } = useDecks();
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [deckName, setDeckName] = useState("");
  const [deckUrl, setDeckUrl] = useState("");
  const [deckFormat, setDeckFormat] = useState("");
  const [allErrors, setAllErrors] = useLocalStorage<Record<string, ErrorQueueItem[]>>("mtg-checklist-errors", {});
  const [validating, setValidating] = useState(false);
  const [progress, setProgress] = useState<ValidationProgress>({ total: 0, validated: 0 });
  const [importError, setImportError] = useState<string | null>(null);
  const [view, setView] = useState<"decks" | "collection" | "orders">("decks");
  const [showImport, setShowImport] = useState(false);
  const [renamingDeckId, setRenamingDeckId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [archidektFetching, setArchidektFetching] = useState(false);
  const [archidektError, setArchidektError] = useState<string | null>(null);
  const [showFormats, setShowFormats] = useState(false);
  const [deckPickerOpen, setDeckPickerOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [deletingDeckId, setDeletingDeckId] = useState<string | null>(null);
  const [editingFormatId, setEditingFormatId] = useState<string | null>(null);
  const [formatDraft, setFormatDraft] = useState("");

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
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [orderVendor, setOrderVendor] = useState("");
  const [orderTracking, setOrderTracking] = useState("");
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [orderExpected, setOrderExpected] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 5); return d.toISOString().split("T")[0];
  });
  const [orderNotes, setOrderNotes] = useState("");
  const [orderCards, setOrderCards] = useState<OrderCard[]>([]);
  const [orderCardSearch, setOrderCardSearch] = useState("");
  const [orderCarrier, setOrderCarrier] = useState<Carrier | "">("");
  const [carrierManuallySet, setCarrierManuallySet] = useState(false);
  const [orderFilter, setOrderFilter] = useState<"active" | "received" | "cancelled" | "all">("active");
  const [showNotes, setShowNotes] = useState(false);
  const [showShipping, setShowShipping] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [deleteConfirmOrderId, setDeleteConfirmOrderId] = useState<string | null>(null);
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

  // Auto-detect carrier from tracking number, unless user has overridden it (B-3)
  useEffect(() => {
    if (!carrierManuallySet && orderTracking.trim()) {
      setOrderCarrier(detectCarrier(orderTracking));
    } else if (!orderTracking.trim()) {
      setOrderCarrier("");
      setCarrierManuallySet(false);
    }
  }, [orderTracking, carrierManuallySet]);

  // Cards across all decks matching the search term (exclude already-added)
  const orderCardResults = orderCardSearch.trim().length >= 2
    ? state.decks.flatMap(deck =>
        deck.cards
          .filter(c => c.name.toLowerCase().includes(orderCardSearch.toLowerCase()))
          .filter(c => !orderCards.some(oc => oc.cardId === c.id && oc.deckId === deck.id))
          .map(c => ({ deckId: deck.id, deckName: deck.name, cardId: c.id, cardName: c.name, maxQty: c.quantity }))
      ).slice(0, 12)
    : [];


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
        format: deckFormat.trim() || undefined,
        cards: taggedCards,
        createdAt: Date.now()
      };

      dispatch({ type: "ADD_DECK", payload: deck });
      setAllErrors(prev => ({ ...prev, [id]: result.errors }));
      setActiveDeckId(id);
      setImportText("");
      setDeckName("");
      setDeckUrl("");
      setDeckFormat("");
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

  // ── Order handlers ────────────────────────────────────────────────────────
  function orderLabel(order: Order): string {
    const d = order.orderDate
      ? new Date(order.orderDate).toLocaleDateString("en-US", { month: "long", day: "numeric" })
      : "";
    return d ? `${order.vendor} — ${d}` : order.vendor;
  }

  function handleCreateOrder() {
    if (!orderVendor.trim() || orderCards.length === 0) return;
    const newOrder: Order = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      vendor: orderVendor.trim(),
      trackingNumber: orderTracking.trim() || undefined,
      carrier: orderTracking.trim() ? (orderCarrier || detectCarrier(orderTracking)) : undefined,
      orderDate: orderDate ? new Date(orderDate).getTime() : undefined,
      expectedArrival: orderExpected ? new Date(orderExpected).getTime() : undefined,
      notes: orderNotes.trim() || undefined,
      status: "active",
      cards: orderCards,
    };
    setOrders(prev => [newOrder, ...prev]);
    // Update recent vendors (dedup, most-recent-first, cap at 6)
    const trimmedVendor = orderVendor.trim();
    setRecentVendors(prev => {
      const next = [trimmedVendor, ...prev.filter(v => v.toLowerCase() !== trimmedVendor.toLowerCase())];
      return next.slice(0, 6);
    });
    setShowCreateOrder(false);
    setShowNotes(false);
    setShowShipping(false);
    setOrderVendor("");
    setOrderTracking("");
    setOrderCarrier("");
    setCarrierManuallySet(false);
    setOrderDate(new Date().toISOString().split("T")[0]);
    setOrderExpected(() => { const d = new Date(); d.setDate(d.getDate() + 5); return d.toISOString().split("T")[0]; });
    setOrderNotes("");
    setOrderCards([]);
    setOrderCardSearch("");
  }

  function handleAddOrderCard(deckId: string, deckName: string, cardId: string, cardName: string, qty: number) {
    setOrderCards(prev => {
      const existing = prev.find(oc => oc.cardId === cardId && oc.deckId === deckId);
      if (existing) return prev;
      return [...prev, { deckId, cardId, cardName, quantity: qty }];
    });
    setOrderCardSearch("");
    void deckName; // used in UI display only
  }

  function handleRemoveOrderCard(cardName: string, deckId?: string) {
    setOrderCards(prev => prev.filter(oc => !(oc.cardName === cardName && oc.deckId === deckId)));
  }

  function handleUpdateOrderCardQty(cardName: string, deckId: string | undefined, qty: number) {
    if (qty <= 0) { handleRemoveOrderCard(cardName, deckId); return; }
    setOrderCards(prev => prev.map(oc =>
      oc.cardName === cardName && oc.deckId === deckId ? { ...oc, quantity: qty } : oc
    ));
  }

  function handleDeleteOrder(id: string) {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    if (order.status === "active" && deleteConfirmOrderId !== id) {
      setDeleteConfirmOrderId(id);
      return;
    }
    setOrders(prev => prev.filter(o => o.id !== id));
    setDeleteConfirmOrderId(null);
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
    const label = orderLabel(order);
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

  // Reset notes expansion whenever the order form closes
  useEffect(() => {
    if (!showCreateOrder) { setShowNotes(false); setShowShipping(false); }
  }, [showCreateOrder]);

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
                    <span className="deck-picker-title">My Decks</span>
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
              <div className="sidebar-header">
                <div className="sidebar-header-top">
                  <h2>Decks <span className="sidebar-deck-count">· {state.decks.length}</span></h2>
                  <div className="sidebar-header-btns">
                    <button className="btn btn-primary btn-sm" onClick={() => setShowImport(v => !v)}>
                      {showImport ? "✕" : "+ New"}
                    </button>
                    <button
                      className="sidebar-toggle"
                      onClick={() => setSidebarOpen(o => !o)}
                      aria-label={sidebarOpen ? "Hide deck list" : "Show deck list"}
                    >
                      {sidebarOpen ? "▲" : "▼"}
                    </button>
                  </div>
                </div>
                {sidebarOpen && (
                  <input
                    className="sidebar-search"
                    placeholder="Filter decks…"
                    value={sidebarSearch}
                    onChange={e => setSidebarSearch(e.target.value)}
                  />
                )}
              </div>
              {sidebarOpen && (
                state.decks.length === 0 ? (
                  <p className="empty-state" style={{ flex: 1 }}>No decks yet.</p>
                ) : filteredDecks.length === 0 ? (
                  <p className="empty-state" style={{ flex: 1 }}>No decks match "{sidebarSearch}".</p>
                ) : (
                  <ul className="deck-list">
                    {filteredDecks.map(deck => {
                      const totalCards = deck.cards.reduce((s, c) => s + c.quantity, 0);
                      const acquiredCards = deck.cards.filter(c => c.acquired).reduce((s, c) => s + c.quantity, 0);
                      const pct = totalCards > 0 ? Math.round((acquiredCards / totalCards) * 100) : 0;
                      const isComplete = totalCards > 0 && acquiredCards === totalCards;
                      const colors = getDeckColorIdentity(deck);
                      const isDeleting = deletingDeckId === deck.id;
                      return (
                        <li
                          key={deck.id}
                          className={`deck-item${activeDeckId === deck.id ? " active" : ""}${isDeleting ? " confirming-delete" : ""}`}
                          onClick={() => { if (!isDeleting) { setActiveDeckId(deck.id); if (window.innerWidth < 1024) setSidebarOpen(false); } }}
                        >
                          <div className="deck-item-info">
                            <div className="deck-item-top">
                              <span className="deck-item-name">{deck.name}</span>
                              <span className={`deck-item-pct${isComplete ? " complete" : ""}`}>
                                {isComplete ? "✓ 100%" : `${pct}%`}
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
                )
              )}
              {/* Profile export/import — always visible, outside the sidebarOpen guard */}
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
              ) : (
                <div className="empty-state centered">
                  <p>Select a deck from the sidebar.</p>
                </div>
              )}
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
          <section className="orders-panel">
            <div className="orders-header">
              <h2>Orders</h2>
              <button className="btn btn-primary btn-sm" onClick={() => { setShowCreateOrder(v => !v); setOrderCardSearch(""); }}>
                {showCreateOrder ? "Close" : "+ New order"}
              </button>
            </div>

            {/* ── Part B: Create order form ───────────────────────────────── */}
            {showCreateOrder && (() => {
              const pickedTotal = orderCards.reduce((s, oc) => s + oc.quantity, 0);
              const pickedGroups = orderCards.reduce<Record<string, OrderCard[]>>((acc, oc) => {
                const key = oc.deckId ?? "__freeform__";
                (acc[key] ??= []).push(oc);
                return acc;
              }, {});

              return (
                <div className="order-form">
                  <h3 className="order-form-title">New order</h3>

                  {/* ① Cards — primary, at the top (B-2) */}
                  <div className="order-form-section">
                    <div className="form-label-row">
                      <span className="form-label">Cards <span className="form-label-req">required</span></span>
                      <span className="form-help">Search your decks or type any card name.</span>
                    </div>

                    {/* Combobox */}
                    <div className="card-combobox">
                      <input
                        className="deck-name-input combobox-input"
                        placeholder="e.g. Lightning Bolt, or any card name…"
                        value={orderCardSearch}
                        onChange={e => setOrderCardSearch(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && orderCardSearch.trim() && orderCardResults.length === 0) {
                            const name = orderCardSearch.trim();
                            setOrderCards(prev => {
                              const ex = prev.find(c => !c.deckId && c.cardName.toLowerCase() === name.toLowerCase());
                              if (ex) return prev.map(c => c === ex ? { ...c, quantity: c.quantity + 1 } : c);
                              return [...prev, { cardName: name, quantity: 1 }];
                            });
                            setOrderCardSearch("");
                          }
                        }}
                      />
                      <span className="combobox-mode">search</span>
                    </div>

                    {orderCardSearch.trim().length >= 2 && (
                      <ul className="combobox-results">
                        {orderCardResults.map(r => (
                          <li key={`${r.deckId}-${r.cardId}`} className="combobox-result">
                            <button type="button" className="combobox-result-btn"
                              onClick={() => handleAddOrderCard(r.deckId, r.deckName, r.cardId, r.cardName, 1)}>
                              <span className="result-name">{r.cardName}</span>
                              <span className="result-deck">{r.deckName} · {r.maxQty}× needed</span>
                              <span className="result-qty-pill">+1</span>
                            </button>
                          </li>
                        ))}
                        <li className="combobox-result combobox-result-freeform">
                          <button type="button" className="combobox-result-btn"
                            onClick={() => {
                              const name = orderCardSearch.trim();
                              setOrderCards(prev => {
                                const ex = prev.find(c => !c.deckId && c.cardName.toLowerCase() === name.toLowerCase());
                                if (ex) return prev.map(c => c === ex ? { ...c, quantity: c.quantity + 1 } : c);
                                return [...prev, { cardName: name, quantity: 1 }];
                              });
                              setOrderCardSearch("");
                            }}>
                            <span className="result-name">Add "<b>{orderCardSearch.trim()}</b>" as a freeform card</span>
                            <span className="result-qty-pill">+1</span>
                          </button>
                        </li>
                      </ul>
                    )}

                    {/* Picked cards — grouped by deck */}
                    {orderCards.length > 0 && (
                      <div className="picked-list">
                        {Object.entries(pickedGroups).map(([key, cards]) => {
                          const isFreeform = key === "__freeform__";
                          const deck = isFreeform ? null : state.decks.find(d => d.id === key);
                          const groupName = isFreeform ? "Not in a deck" : (deck?.name ?? "Unknown deck");
                          const groupCount = cards.reduce((s, c) => s + c.quantity, 0);
                          return (
                            <div key={key} className="picked-group">
                              <div className="picked-group-head">
                                <span className={`picked-group-dot${isFreeform ? " freeform" : ""}`} />
                                <span className="picked-group-name">{groupName}</span>
                                <span className="picked-group-count">{groupCount} card{groupCount !== 1 ? "s" : ""}</span>
                              </div>
                              {cards.map(oc => {
                                const d = oc.deckId ? state.decks.find(x => x.id === oc.deckId) : undefined;
                                const maxQty = oc.cardId ? (d?.cards.find(c => c.id === oc.cardId)?.quantity ?? oc.quantity) : 999;
                                return (
                                  <div key={`${oc.deckId ?? "free"}-${oc.cardName}`} className="picked-row">
                                    <span className="picked-row-name">{oc.cardName}</span>
                                    <div className="picked-row-stepper">
                                      <button type="button" className="step-btn"
                                        onClick={() => handleUpdateOrderCardQty(oc.cardName, oc.deckId, Math.max(1, oc.quantity - 1))}>−</button>
                                      <span className="step-val">{oc.quantity}</span>
                                      <button type="button" className="step-btn"
                                        onClick={() => handleUpdateOrderCardQty(oc.cardName, oc.deckId, oc.quantity + 1)}
                                        disabled={oc.quantity >= maxQty}>+</button>
                                    </div>
                                    <button type="button" className="picked-row-remove"
                                      onClick={() => handleRemoveOrderCard(oc.cardName, oc.deckId)}>×</button>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* ② Vendor — required (B-1) */}
                  <div className="order-form-section">
                    <span className="form-label">Vendor <span className="form-label-req">required</span></span>
                    <input
                      className="deck-name-input"
                      placeholder="Pick one or type your own"
                      value={orderVendor}
                      onChange={e => setOrderVendor(e.target.value)}
                    />
                    {recentVendors.length > 0 && (
                      <div className="vendor-chips">
                        {recentVendors.map(v => (
                          <button key={v} type="button"
                            className={`vendor-chip${orderVendor === v ? " active" : ""}`}
                            onClick={() => setOrderVendor(v)}>{v}</button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ③ Shipping & tracking — collapsible (B-1, B-3) */}
                  {!showShipping ? (
                    <button type="button" className="form-collapser" onClick={() => setShowShipping(true)}>
                      <span><span className="collapser-add">+</span> Shipping &amp; tracking</span>
                      <span className="form-collapser-hint">
                        {orderCarrier && orderCarrier !== "other" ? CARRIER_NAMES[orderCarrier as Carrier] : ""}
                        {orderExpected ? ` · arrives ${formatShortDate(new Date(orderExpected).getTime())}` : ""}
                      </span>
                    </button>
                  ) : (
                    <div className="order-form-section order-form-shipping">
                      <div className="form-grid-2">
                        <label className="form-field">
                          <span className="form-label">Order date</span>
                          <input className="deck-name-input" type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
                        </label>
                        <label className="form-field">
                          <span className="form-label">Expected arrival</span>
                          <input className="deck-name-input" type="date" value={orderExpected} onChange={e => setOrderExpected(e.target.value)} />
                        </label>
                      </div>
                      <label className="form-field">
                        <span className="form-label">Tracking number</span>
                        <input
                          className="deck-name-input"
                          placeholder="Optional"
                          value={orderTracking}
                          onChange={e => setOrderTracking(e.target.value)}
                        />
                      </label>
                      {orderTracking.trim() && (
                        <label className="form-field">
                          <span className="form-label">Carrier</span>
                          <select
                            className="deck-name-input"
                            value={orderCarrier || "other"}
                            onChange={e => { setOrderCarrier(e.target.value as Carrier); setCarrierManuallySet(true); }}
                          >
                            {(Object.keys(CARRIER_NAMES) as Carrier[]).map(c => (
                              <option key={c} value={c}>{CARRIER_NAMES[c]}</option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  )}

                  {/* ④ Notes — collapsible (B-1) */}
                  {!showNotes ? (
                    <button type="button" className="form-collapser" onClick={() => setShowNotes(true)}>
                      <span><span className="collapser-add">+</span> Notes</span>
                    </button>
                  ) : (
                    <label className="form-field">
                      <span className="form-label">Notes</span>
                      <textarea
                        className="deck-name-input order-notes-textarea"
                        style={{ fontFamily: "inherit" }}
                        placeholder="Optional notes"
                        value={orderNotes}
                        onChange={e => setOrderNotes(e.target.value)}
                        rows={2}
                        autoFocus
                      />
                    </label>
                  )}

                  {/* ⑤ Submit (B-4) */}
                  <div className="order-form-actions">
                    <button
                      className="btn btn-primary"
                      onClick={handleCreateOrder}
                      disabled={!orderVendor.trim() || orderCards.length === 0}
                    >
                      Create order{pickedTotal > 0 ? ` · ${pickedTotal} card${pickedTotal !== 1 ? "s" : ""}` : ""}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowCreateOrder(false)}>Discard</button>
                  </div>
                </div>
              );
            })()}

            {/* ── Part A: Order list ──────────────────────────────────────── */}
            {(() => {
              const now = Date.now();
              const annotatedOrders = orders.map(o => ({
                ...o,
                isLate: o.status === "active" && o.expectedArrival != null && o.expectedArrival < now,
              }));
              const orderCounts = {
                active:    annotatedOrders.filter(o => o.status === "active").length,
                received:  annotatedOrders.filter(o => o.status === "received").length,
                cancelled: annotatedOrders.filter(o => o.status === "cancelled").length,
                all:       annotatedOrders.length,
              };
              const filtered = orderFilter === "all"
                ? annotatedOrders
                : annotatedOrders.filter(o => o.status === orderFilter);
              const sortedOrders = orderFilter === "active"
                ? [...filtered].sort((a, b) => {
                    if (a.isLate !== b.isLate) return a.isLate ? -1 : 1;
                    return (a.expectedArrival ?? Infinity) - (b.expectedArrival ?? Infinity);
                  })
                : filtered;

              if (orders.length === 0 && !showCreateOrder) {
                return (
                  <div className="orders-empty">
                    <p>No orders yet.</p>
                    <p className="orders-empty-hint">
                      Create an order to track cards you've bought — mark it received when they arrive to automatically tag them as Owned and update your collection.
                    </p>
                  </div>
                );
              }
              if (orders.length === 0) return null;

              return (
                <>
                  {/* A-1: Filter tabs */}
                  <div className="order-filter-tabs">
                    {(["active", "received", "cancelled", "all"] as const).map(f => (
                      <button key={f}
                        className={`order-filter-tab${orderFilter === f ? " active" : ""}`}
                        onClick={() => setOrderFilter(f)}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                        {f !== "all" && <span className="count">{orderCounts[f]}</span>}
                      </button>
                    ))}
                  </div>

                  {/* A-1: Per-filter empty states */}
                  {sortedOrders.length === 0 ? (
                    <div className="orders-empty">
                      {orderFilter === "active"    && <p>No active orders.</p>}
                      {orderFilter === "received"  && <p>No received orders yet.</p>}
                      {orderFilter === "cancelled" && <p>No cancelled orders.</p>}
                    </div>
                  ) : (
                    <ul className="order-list">
                      {sortedOrders.map(order => {
                        const isExpanded = expandedOrderId === order.id;
                        const isConfirmingDelete = deleteConfirmOrderId === order.id;
                        const effectiveStatus = order.isLate ? "late" : order.status;
                        const cardsByDeck = order.cards.reduce<Record<string, { deckName: string; cards: OrderCard[] }>>((acc, oc) => {
                          const groupKey = oc.deckId ?? "__freeform__";
                          const deck = oc.deckId ? state.decks.find(d => d.id === oc.deckId) : undefined;
                          const deckName = oc.deckId ? (deck?.name ?? "Deleted deck") : "No deck";
                          if (!acc[groupKey]) acc[groupKey] = { deckName, cards: [] };
                          acc[groupKey].cards.push(oc);
                          return acc;
                        }, {});

                        return (
                          <li key={order.id} className={`order-row order-row-${effectiveStatus}`}>
                            {/* A-2: CSS-grid stripe */}
                            <span className="order-row-stripe" />

                            <div className="order-row-body">
                              {/* ── Active / Late layout ── */}
                              {(order.status === "active") && (<>
                                <div className="order-row-top">
                                  <span className="order-row-vendor">{order.vendor}</span>
                                  <span className="order-row-cards">{totalCardQuantity(order)} card{totalCardQuantity(order) !== 1 ? "s" : ""}</span>
                                  <span className={`order-status-badge order-status-${effectiveStatus}`}>
                                    {order.isLate ? "Late" : "Active"}
                                  </span>
                                </div>

                                {order.expectedArrival && (
                                  <div className="order-row-eta">
                                    <span className={`order-row-eta-main${order.isLate ? " late" : isUrgent(order.expectedArrival) ? " urgent" : ""}`}>
                                      {order.isLate
                                        ? `⚠ ${daysOverdue(order.expectedArrival)} day${daysOverdue(order.expectedArrival) !== 1 ? "s" : ""} overdue`
                                        : formatEtaMain(order.expectedArrival)}
                                    </span>
                                    <span className="order-row-eta-sub">
                                      {order.orderDate && `Ordered ${formatShortDate(order.orderDate)} · `}
                                      Expected {formatShortDate(order.expectedArrival)}
                                    </span>
                                  </div>
                                )}

                                {order.trackingNumber && (
                                  <div className="order-row-meta">
                                    <a className="order-tracking-link"
                                      href={getTrackingUrl(order.trackingNumber, order.carrier ?? "other")}
                                      target="_blank" rel="noopener noreferrer">
                                      <span className="carrier-tag">{CARRIER_NAMES[order.carrier ?? "other"]}</span>
                                      <span className="tn-tail">···{order.trackingNumber.slice(-4)}</span>
                                      <span>↗</span>
                                    </a>
                                  </div>
                                )}

                                {/* A-2/A-3: Primary actions + Details toggle */}
                                <div className="order-row-actions">
                                  <button className="btn btn-primary btn-sm"
                                    onClick={() => handleMarkReceived(order.id)}>✓ Mark received</button>
                                  <button className="btn btn-quiet btn-sm"
                                    onClick={() => handleMarkCancelled(order.id)}>Cancel order</button>
                                  <button className="btn btn-quiet btn-sm"
                                    onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}>
                                    Details {isExpanded ? "▴" : "▾"}
                                  </button>
                                </div>
                              </>)}

                              {/* ── Received layout ── */}
                              {order.status === "received" && (<>
                                <div className="order-row-top">
                                  <span className="order-row-vendor muted">
                                    {order.vendor} · {formatShortDate(order.createdAt)}
                                  </span>
                                  <span className="order-status-badge order-status-received">Received</span>
                                  <button className="btn btn-quiet btn-sm"
                                    onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}>
                                    {isExpanded ? "▴" : "▾"}
                                  </button>
                                </div>
                                <div className="order-row-received-summary">
                                  ✓ {totalCardQuantity(order)} card{totalCardQuantity(order) !== 1 ? "s" : ""} merged into collection
                                  {affectedDeckCount(order) > 0 && ` · ${affectedDeckCount(order)} deck${affectedDeckCount(order) !== 1 ? "s" : ""} updated`}
                                </div>
                              </>)}

                              {/* ── Cancelled layout ── */}
                              {order.status === "cancelled" && (<>
                                <div className="order-row-top">
                                  <span className="order-row-vendor muted">
                                    {order.vendor} · {formatShortDate(order.createdAt)}
                                  </span>
                                  <span className="order-status-badge order-status-cancelled">Cancelled</span>
                                  <button className="btn btn-quiet btn-sm"
                                    onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}>
                                    {isExpanded ? "▴" : "▾"}
                                  </button>
                                </div>
                                <div className="order-row-impact">
                                  ↺ {totalCardQuantity(order)} card{totalCardQuantity(order) !== 1 ? "s" : ""} untagged
                                  {affectedDeckCount(order) > 0 && ` across ${affectedDeckCount(order)} deck${affectedDeckCount(order) !== 1 ? "s" : ""}`}
                                </div>
                              </>)}
                            </div>

                            {/* A-3: Details panel (notes + per-deck breakdown + delete) */}
                            {isExpanded && (
                              <div className="order-row-detail">
                                {order.notes && <p className="order-notes">{order.notes}</p>}
                                <div className="order-cards-by-deck">
                                  {Object.values(cardsByDeck).map(({ deckName, cards }) => (
                                    <div key={deckName} className="order-deck-group">
                                      <div className="order-deck-group-name">{deckName}</div>
                                      <ul className="order-deck-card-list">
                                        {cards.map(oc => (
                                          <li key={`${oc.cardId ?? oc.cardName}`} className="order-deck-card-item">
                                            {oc.quantity}× {oc.cardName}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  ))}
                                </div>
                                <div className="order-row-detail-actions">
                                  {isConfirmingDelete ? (
                                    <>
                                      <span className="order-delete-confirm-text">Delete this order anyway?</span>
                                      <button className="btn btn-ghost btn-sm order-delete-confirm-btn"
                                        onClick={() => handleDeleteOrder(order.id)}>Yes, delete</button>
                                      <button className="btn btn-ghost btn-sm"
                                        onClick={() => setDeleteConfirmOrderId(null)}>Keep</button>
                                    </>
                                  ) : (
                                    <button className="btn btn-ghost btn-sm order-delete-btn"
                                      onClick={() => setDeleteConfirmOrderId(order.id)}>Delete</button>
                                  )}
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              );
            })()}
          </section>
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
