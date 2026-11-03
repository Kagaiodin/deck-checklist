import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, act, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { DemoConfirmModal } from "../features/demo/DemoConfirmModal";
import { TradeSheet } from "../features/trade/components/TradeSheet";
import { OnboardingModal } from "../features/onboarding/OnboardingModal";
import { ImportBackupModal } from "../features/profile/ImportBackupModal";
import { CollectionOverflowSheet } from "../features/collection/components/CollectionOverflowSheet";

// Every modal must close on Escape. Axe cannot check keyboard behaviour, so this is the
// shared guard (#86). Sheets with their own dedicated Escape tests (CardRowSheet, BuyListSheet,
// NewOrderSheet, OrdersPage) are covered next to their components; DriveConflictModal is
// excluded until its Escape semantics are decided.
type Case = [name: string, make: (close: () => void) => ReactElement, settle?: number];

const noop = () => {};
const cases: Case[] = [
  ["DemoConfirmModal", close => <DemoConfirmModal onCancel={close} onConfirm={noop} />],
  ["TradeSheet", close => <TradeSheet title="Trade" chip="x" onClose={close} footer={null}><input /></TradeSheet>],
  ["OnboardingModal", close => <OnboardingModal onDismiss={close} onImportDeck={noop} />],
  ["ImportBackupModal", close => <ImportBackupModal onImport={() => ({ newDecks: 0, newCards: 0, newOrders: 0 })} showToast={noop} onClose={close} />],
  ["CollectionOverflowSheet", close => <CollectionOverflowSheet collectionMeta={null} onClose={close} onUploadClick={noop} onBulkEditClick={noop} />, 400],
];

describe("modals close on Escape", () => {
  afterEach(() => { vi.useRealTimers(); document.body.style.overflow = ""; });

  it.each(cases)("%s", (_name, make, settle = 0) => {
    vi.useFakeTimers();
    const close = vi.fn();
    render(make(close));
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getAllByRole("dialog", { hidden: true }).length).toBeGreaterThan(0);
    fireEvent.keyDown(document, { key: "Escape" });
    act(() => { vi.advanceTimersByTime(settle); });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
