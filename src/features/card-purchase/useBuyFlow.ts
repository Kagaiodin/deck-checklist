import { useState, useCallback } from "react";
import type { Card, Order, OrderCard } from "../../types/index";

// ── Vendor definitions ────────────────────────────────────────────────────────

export interface Vendor {
  id: string;
  label: string;
  emoji: string;
  /** true = window.open with prefill; false = clipboard only */
  prefill: boolean;
  /** URL to open after send. Empty string = clipboard-only, no site opened. */
  url: string;
  sendMethodDesc: string;
}

export const VENDORS: Vendor[] = [
  {
    id: "manapool",
    label: "Manapool",
    emoji: "🟣",
    prefill: true,
    url: "https://manapool.com/add-deck",
    sendMethodDesc: "Opens prefilled tab in your browser",
  },
  {
    id: "tcgplayer",
    label: "TCGPlayer",
    emoji: "🔵",
    prefill: false,
    url: "https://www.tcgplayer.com/massentry",
    sendMethodDesc: "Copies list to clipboard — paste in tab",
  },
  {
    id: "card_kingdom",
    label: "Card Kingdom",
    emoji: "🟢",
    prefill: false,
    url: "https://www.cardkingdom.com/builder",
    sendMethodDesc: "Copies list to clipboard — paste in tab",
  },
  {
    id: "other",
    label: "Other / Local store",
    emoji: "📋",
    prefill: false,
    url: "",
    sendMethodDesc: "Copies list to clipboard — paste in any site",
  },
];

// ── localStorage keys ─────────────────────────────────────────────────────────

const LAST_VENDOR_KEY = "fetchlist-last-vendor";
const VENDOR_LAST_USED_KEY = "fetchlist-vendor-last-used";

function getLastVendorId(): string | null {
  try { return localStorage.getItem(LAST_VENDOR_KEY); } catch { return null; }
}

function setLastVendorId(vendorId: string): void {
  try { localStorage.setItem(LAST_VENDOR_KEY, vendorId); } catch { /* ignore */ }
}

function getVendorLastUsed(): Record<string, number> {
  try {
    const raw = localStorage.getItem(VENDOR_LAST_USED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch { return {}; }
}

function recordVendorUsed(vendorId: string): void {
  try {
    const map = getVendorLastUsed();
    map[vendorId] = Date.now();
    localStorage.setItem(VENDOR_LAST_USED_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SendState = "idle" | "sending" | "success" | "error";
export type ErrorType = "clipboard-denied" | "popup-blocked";

export interface BuyFlowState {
  /** Is the buy list sheet open? */
  buySheetOpen: boolean;
  /** Is the vendor picker sub-view open? */
  vendorPickerOpen: boolean;
  sendState: SendState;
  errorType: ErrorType | null;
  /** URL stored for popup-blocked manual-open button */
  sendUrl: string | null;
  /** List text for clipboard-denied fallback textarea */
  clipboardText: string | null;
  /** ID of the auto-created order draft; set on success */
  createdOrderId: string | null;
  /** Currently selected vendor (persisted via lastVendor) */
  selectedVendorId: string | null;
}

export interface BuyFlowActions {
  openBuySheet: () => void;
  closeBuySheet: () => void;
  openVendorPicker: () => void;
  closeVendorPicker: () => void;
  selectVendor: (vendorId: string) => void;
  confirmVendor: (vendorId: string) => void;
  handleSend: (vendorId: string) => Promise<void>;
  resetSendState: () => void;
  getVendorLastUsedMap: () => Record<string, number>;
  onViewOrder: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseBuyFlowOptions {
  toBuyCards: Card[];
  deckId: string | null;
  /** Called to persist a new auto-created order draft */
  onCreateOrder: (order: Order) => void;
  /** Called when user taps "View order" — navigate to orders tab */
  onViewOrder: () => void;
  /** Generate a new order ID */
  nextOrderId: () => string;
}

export function useBuyFlow({
  toBuyCards,
  deckId,
  onCreateOrder,
  onViewOrder,
  nextOrderId,
}: UseBuyFlowOptions): BuyFlowState & BuyFlowActions {
  const [buySheetOpen, setBuySheetOpen] = useState(false);
  const [vendorPickerOpen, setVendorPickerOpen] = useState(false);
  const [sendState, setSendState] = useState<SendState>("idle");
  const [errorType, setErrorType] = useState<ErrorType | null>(null);
  const [sendUrl, setSendUrl] = useState<string | null>(null);
  const [clipboardText, setClipboardText] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(
    () => getLastVendorId()
  );

  const openBuySheet = useCallback(() => {
    setSendState("idle");
    setErrorType(null);
    setSendUrl(null);
    setClipboardText(null);
    setCreatedOrderId(null);
    setBuySheetOpen(true);
  }, []);

  const closeBuySheet = useCallback(() => {
    setBuySheetOpen(false);
    setVendorPickerOpen(false);
    setSendState("idle");
    setErrorType(null);
    setSendUrl(null);
    setClipboardText(null);
    setCreatedOrderId(null);
  }, []);

  const openVendorPicker = useCallback(() => {
    setVendorPickerOpen(true);
  }, []);

  const closeVendorPicker = useCallback(() => {
    setVendorPickerOpen(false);
  }, []);

  const selectVendor = useCallback((vendorId: string) => {
    setSelectedVendorId(vendorId);
  }, []);

  /** Confirm vendor selection in the picker: persist + close picker */
  const confirmVendor = useCallback((vendorId: string) => {
    setSelectedVendorId(vendorId);
    setLastVendorId(vendorId);
    setVendorPickerOpen(false);
  }, []);

  const resetSendState = useCallback(() => {
    setSendState("idle");
    setErrorType(null);
    setSendUrl(null);
    setClipboardText(null);
  }, []);

  const getVendorLastUsedMap = useCallback(() => getVendorLastUsed(), []);

  /** Build the formatted card list for this vendor */
  function buildList(): string {
    return toBuyCards.map(c => `${c.quantity} ${c.name}`).join("\n");
  }

  /** Create an order draft and return its id */
  function createOrderDraft(vendorId: string): string {
    const vendor = VENDORS.find(v => v.id === vendorId);
    const id = nextOrderId();
    const orderCards: OrderCard[] = toBuyCards.map(c => ({
      cardName: c.name,
      quantity: c.quantity,
      deckId: deckId ?? undefined,
      cardId: c.id,
    }));
    const draft: Order = {
      id,
      createdAt: Date.now(),
      vendor: vendor?.label ?? vendorId,
      status: "active",
      cards: orderCards,
    };
    onCreateOrder(draft);
    return id;
  }

  const handleSend = useCallback(async (vendorId: string) => {
    const vendor = VENDORS.find(v => v.id === vendorId);
    if (!vendor) return;

    setSendState("sending");
    const list = buildList();

    if (vendor.prefill) {
      // Tab-based vendor (Manapool): encode list and open
      const encoded = btoa(unescape(encodeURIComponent(list)));
      const url = `${vendor.url}?deck=${encoded}`;
      const win = window.open(url, "_blank");
      if (!win || win.closed || typeof win.closed === "undefined") {
        // Popup blocked
        setErrorType("popup-blocked");
        setSendUrl(url);
        setSendState("error");
        return;
      }
    } else {
      // Clipboard-based vendor (TCGPlayer, Card Kingdom)
      try {
        await navigator.clipboard.writeText(list);
      } catch (err) {
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          setClipboardText(list);
          setErrorType("clipboard-denied");
          setSendState("error");
          return;
        }
        // Other clipboard errors — treat as clipboard-denied
        setClipboardText(list);
        setErrorType("clipboard-denied");
        setSendState("error");
        return;
      }
    }

    // Success path — persist vendor + create order draft
    setLastVendorId(vendorId);
    setSelectedVendorId(vendorId);
    recordVendorUsed(vendorId);
    const orderId = createOrderDraft(vendorId);
    setCreatedOrderId(orderId);
    setSendState("success");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toBuyCards, deckId]);

  return {
    // State
    buySheetOpen,
    vendorPickerOpen,
    sendState,
    errorType,
    sendUrl,
    clipboardText,
    createdOrderId,
    selectedVendorId,
    // Actions
    openBuySheet,
    closeBuySheet,
    openVendorPicker,
    closeVendorPicker,
    selectVendor,
    confirmVendor,
    handleSend,
    resetSendState,
    getVendorLastUsedMap,
    onViewOrder,
  } as BuyFlowState & BuyFlowActions & { onViewOrder: () => void };
}
