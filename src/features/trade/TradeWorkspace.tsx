import { useCallback, useEffect, useRef, useState } from "react";
import type { Collection, Deck } from "../../types/index";
import type { Condition, Finish, Trade, TradeCard } from "../../types/trade";
import { basePriceFor, isSideEmpty, unitPrice } from "../../utils/tradePricing";
import { fetchPrices, priceKey } from "../../utils/scryfallSearch";
import { buildShareUrl, encodeTrade, isShareUrlTooLong, tradeToText } from "../../utils/tradeShare";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { loadLocalTrade, useTrade, type SideKey } from "./hooks/useTrade";
import { ownedFor } from "./collectionMatch";
import { FINISH_LABEL, oldestPriceAt, usd } from "./format";
import { CardSearchSheet } from "./components/CardSearchSheet";
import { CollectionPickerSheet } from "./components/CollectionPickerSheet";
import { ControlPanel } from "./components/ControlPanel";
import { FairnessMeter } from "./components/FairnessMeter";
import { ForkConfirmDialog } from "./components/ForkConfirmDialog";
import { OfferPanel } from "./components/OfferPanel";
import { ShareBanner } from "./components/ShareBanner";
import { TradeSheet } from "./components/TradeSheet";
import { TradeToast, type ToastState } from "./components/TradeToast";
import { ChevronIcon, SearchIcon, StackIcon } from "./components/TradeIcons";

interface TradeWorkspaceProps {
  /** A trade opened from a share link. Omit to work on the saved local trade. */
  initial?: Trade;
  snapshotAt: number | null;
  collection: Collection;
  decks: Deck[];
  /** Called once a shared trade has been forked, so the page can drop the link from the URL. */
  onForked: () => void;
}

type OpenSheet = { kind: "search"; side: SideKey } | { kind: "collection" } | null;

const SIDE_LABEL: Record<SideKey, string> = { mine: "My offer", theirs: "Their offer" };

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function TradeWorkspace({ initial, snapshotAt, collection, decks, onForked }: TradeWorkspaceProps) {
  const t = useTrade(initial);
  const { trade } = t;
  const ro = trade.readOnly;
  const mobile = useMediaQuery("(max-width: 767px)");

  const [tab, setTab] = useState<SideKey>("mine");
  const [controlsOpen, setControlsOpen] = useState(false);
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [confirmFork, setConfirmFork] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [jumpId, setJumpId] = useState<string | null>(null);
  const toastSeq = useRef(0);
  const tRef = useRef(t);
  tRef.current = t;

  const showToast = useCallback((message: string, action?: ToastState["action"]) => {
    setToast({ id: ++toastSeq.current, message, action });
  }, []);
  const withUndo = (message: string) => showToast(message, { label: "Undo", onClick: () => tRef.current.undo() });

  // ⌘Z / ⇧⌘Z, unless the user is typing or a dialog is open.
  useEffect(() => {
    if (ro) return;
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      if ((e.target as HTMLElement | null)?.closest?.("input, select, textarea, [contenteditable='true']")) return;
      if (document.querySelector(".tr-scrim")) return;
      e.preventDefault();
      if (e.shiftKey) tRef.current.redo();
      else tRef.current.undo();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ro]);

  const getOwned = useCallback((card: TradeCard) => ownedFor(collection, decks, card), [collection, decks]);

  // ── Derived display values ─────────────────────────────────────────────────
  const allCards = [...trade.mine.cards, ...trade.theirs.cards];
  const staleCount = allCards.filter((c) => t.staleIds.has(c.id)).length;
  const neutralText = isSideEmpty(trade.mine) && isSideEmpty(trade.theirs)
    ? "Add cards to both sides to compare"
    : isSideEmpty(trade.mine) ? "Add cards to My offer to compare" : "Add cards to Their offer to compare";
  const cardCount = (side: SideKey) => trade[side].cards.reduce((n, c) => n + c.quantity, 0);

  // ── Handlers ───────────────────────────────────────────────────────────────
  function addFromSearch(side: SideKey, card: Omit<TradeCard, "id">) {
    t.addCard(side, card);
    setSheet(null);
    showToast(`Added ${card.name}`);
  }

  function addFromCollection(cards: Omit<TradeCard, "id">[]) {
    t.addCards("mine", cards);
    setSheet(null);
    const unpriced = cards.filter((c) => c.basePrice === null).length;
    showToast(
      `Added ${cards.length} from collection${unpriced ? ` · ${unpriced} without a price` : ""}`,
      { label: "Undo", onClick: () => tRef.current.undo() }
    );
  }

  /** Changing finish means a different Scryfall price, so re-fetch before applying it. */
  async function changeFinish(side: SideKey, card: TradeCard, finish: Finish) {
    const prices = await fetchPrices([{ scryfallId: card.scryfallId || undefined, set: card.set, collectorNumber: card.collectorNumber }]);
    const p = prices.get(priceKey(card)) ?? prices.get(`${card.set.toLowerCase()}:${card.collectorNumber}`);
    if (!p) {
      showToast(`Couldn't load the ${FINISH_LABEL[finish].toLowerCase()} price. Try again.`);
      return;
    }
    if (!p.finishes.includes(finish)) {
      showToast(`${card.name} (${card.set.toUpperCase()}) doesn't come in ${FINISH_LABEL[finish].toLowerCase()}.`);
      return;
    }
    t.updateCard(side, card.id, {
      finish,
      basePrice: basePriceFor(p.prices, finish),
      priceFetchedAt: Date.now(),
      scryfallId: card.scryfallId || p.scryfallId,
      imageUrl: card.imageUrl ?? p.imageUrl,
    });
  }

  function setSideCondition(side: SideKey, condition: Condition) {
    const n = trade[side].cards.length;
    t.setSideCondition(side, condition);
    withUndo(`Set ${n} card${n === 1 ? "" : "s"} on ${SIDE_LABEL[side]} to ${condition}`);
  }

  function removeCard(side: SideKey, card: TradeCard) {
    t.removeCard(side, card.id);
    withUndo(`Removed ${card.name}`);
  }

  function clearTrade() {
    const n = allCards.reduce((sum, c) => sum + c.quantity, 0);
    t.clear();
    withUndo(n > 0 ? `Cleared ${n} card${n === 1 ? "" : "s"}` : "Cleared trade");
  }

  function addBalance(side: SideKey, amount: number) {
    t.addCash(side, amount);
    withUndo(`Added ${usd(amount)} cash to ${SIDE_LABEL[side]}`);
  }

  async function copyText() {
    const ok = await copy(tradeToText(trade));
    showToast(ok ? "Trade summary copied as text" : "Couldn't copy — clipboard access was blocked");
  }

  async function share() {
    const url = buildShareUrl(window.location.origin, await encodeTrade(trade));
    if (isShareUrlTooLong(url)) {
      const ok = await copy(tradeToText(trade));
      showToast(ok ? "Too many cards for a link — copied as text instead" : "Couldn't copy — clipboard access was blocked");
      return;
    }
    const ok = await copy(url);
    showToast(ok ? "Link copied — it opens read-only for them" : "Couldn't copy — clipboard access was blocked");
  }

  function doFork() {
    t.fork();
    setConfirmFork(false);
    onForked();
    showToast("Forked into your own trade", { label: "Undo", onClick: () => tRef.current.undo() });
  }

  function requestFork() {
    if (t.localTradeIsEmpty()) doFork();
    else setConfirmFork(true);
  }

  async function copyMine() {
    const ok = await copy(tradeToText(loadLocalTrade()));
    showToast(ok ? "Your current trade copied as text" : "Couldn't copy — clipboard access was blocked");
  }

  // ── Jump to the first unpriced row ─────────────────────────────────────────
  function jumpToMissing() {
    const noPrice = (side: SideKey) => trade[side].cards.find((c) => unitPrice(c, trade[side], trade.settings) === null);
    const side: SideKey | null = noPrice("mine") ? "mine" : noPrice("theirs") ? "theirs" : null;
    const card = side ? noPrice(side) : undefined;
    if (!side || !card) return;
    setControlsOpen(false);
    if (mobile) setTab(side);
    setJumpId(card.id);
  }

  useEffect(() => {
    if (!jumpId) return;
    const row = document.querySelector<HTMLElement>(`[data-card-id="${jumpId}"]`);
    setJumpId(null);
    if (!row) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView?.({ block: "center", behavior: reduce ? "auto" : "smooth" });
    row.querySelector<HTMLElement>(".tr-unit-btn")?.focus({ preventScroll: true });
    setFlashId(jumpId);
    const timer = setTimeout(() => setFlashId(null), 1300);
    return () => clearTimeout(timer);
  }, [jumpId]);

  // ── Shared pieces ──────────────────────────────────────────────────────────
  const offerPanel = (side: SideKey) => (
    <OfferPanel
      side={side}
      data={trade[side]}
      totals={side === "mine" ? t.mineTotals : t.theirTotals}
      settings={trade.settings}
      readOnly={ro}
      hideAdds={mobile}
      staleIds={t.staleIds}
      flashId={flashId}
      getOwned={getOwned}
      onAddFromCollection={side === "mine" ? () => setSheet({ kind: "collection" }) : undefined}
      onAddSearch={() => setSheet({ kind: "search", side })}
      onUpdateCard={(id, patch) => t.updateCard(side, id, patch)}
      onRemoveCard={(id) => { const c = trade[side].cards.find((x) => x.id === id); if (c) removeCard(side, c); }}
      onChangeFinish={(card, finish) => void changeFinish(side, card, finish)}
      onSetSideDiscount={(pct) => t.setSideDiscount(side, pct)}
      onSetSideCondition={(c) => setSideCondition(side, c)}
      onUpdateCash={(id, amount) => t.updateCash(side, id, amount)}
      onRemoveCash={(id) => t.removeCash(side, id)}
    />
  );

  const controlPanel = (variant: "panel" | "sheet") => (
    <ControlPanel
      trade={trade}
      variant={variant}
      mineTotals={t.mineTotals}
      theirTotals={t.theirTotals}
      fairness={t.fairness}
      isNeutral={t.isNeutral}
      neutralText={neutralText}
      missingPriceCount={t.missingPriceCount}
      staleCount={staleCount}
      refreshing={t.refreshStatus === "loading"}
      oldestPriceAt={oldestPriceAt(allCards)}
      snapshotAt={ro ? snapshotAt : null}
      canUndo={t.canUndo}
      canRedo={t.canRedo}
      onAddBalance={addBalance}
      onAddCash={(side) => t.addCash(side, 0)}
      onSetSettings={t.setSettings}
      onRefresh={() => void t.refreshPrices()}
      onJumpToMissing={jumpToMissing}
      onUndo={t.undo}
      onRedo={t.redo}
      onSwap={() => { t.swap(); withUndo("Swapped sides"); }}
      onClear={clearTrade}
      onCopyText={() => void copyText()}
      onShare={() => void share()}
    />
  );

  return (
    <>
      {ro && <ShareBanner snapshotAt={snapshotAt} onFork={requestFork} />}

      {mobile ? (
        <>
          <button
            type="button"
            className="tr-meterbar"
            aria-haspopup="dialog"
            aria-expanded={controlsOpen}
            aria-label="Open trade controls"
            onClick={() => setControlsOpen(true)}
          >
            <span className="tot">
              <span>Mine <span className="tr-mono">{usd(t.mineTotals.total)}</span></span>
              <span className="open">Controls <ChevronIcon size={14} /></span>
              <span>Theirs <span className="tr-mono">{usd(t.theirTotals.total)}</span></span>
            </span>
            <FairnessMeter compact fairness={t.fairness} isNeutral={t.isNeutral} tolerancePct={trade.settings.tolerancePct} neutralText={neutralText} />
          </button>

          <div className="tr-tabs" role="tablist" aria-label="Offer side">
            {(["mine", "theirs"] as SideKey[]).map((side) => (
              <button key={side} type="button" role="tab" id={`tr-tab-${side}`} aria-selected={tab === side} aria-controls="tr-tabpanel" onClick={() => setTab(side)}>
                {SIDE_LABEL[side]} <span className="tr-mono">{cardCount(side)}</span>
              </button>
            ))}
          </div>
          <div id="tr-tabpanel" role="tabpanel" aria-labelledby={`tr-tab-${tab}`}>{offerPanel(tab)}</div>

          {!ro && (
            <div className="tr-bottom-bar">
              {tab === "mine" && (
                <button type="button" className="btn btn-secondary" onClick={() => setSheet({ kind: "collection" })}><StackIcon />From collection</button>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => setSheet({ kind: "search", side: tab })}><SearchIcon />Search cards</button>
            </div>
          )}

          {controlsOpen && (
            <TradeSheet title="Trade controls" onClose={() => setControlsOpen(false)}>
              {controlPanel("sheet")}
            </TradeSheet>
          )}
        </>
      ) : (
        <div className="tr-grid">
          {offerPanel("mine")}
          {controlPanel("panel")}
          {offerPanel("theirs")}
        </div>
      )}

      {sheet?.kind === "search" && (
        <CardSearchSheet side={sheet.side} onAdd={(card) => addFromSearch(sheet.side, card)} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === "collection" && (
        <CollectionPickerSheet collection={collection} decks={decks} onAdd={addFromCollection} onClose={() => setSheet(null)} />
      )}
      {confirmFork && <ForkConfirmDialog onCancel={() => setConfirmFork(false)} onReplace={doFork} onCopyMine={() => void copyMine()} />}

      <TradeToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
