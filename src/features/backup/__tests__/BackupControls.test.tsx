import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BackupControls } from "../BackupControls";
import { clearLinkedHandle } from "../../../utils/fileSystemAccess";
import { installMemoryLocalStorage, restoreLocalStorage } from "../../demo/__tests__/memoryStorage";

const originalCreateElement = document.createElement.bind(document);

function mockAnchorClick(): ReturnType<typeof vi.fn> {
  const clickSpy = vi.fn();
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = originalCreateElement(tag);
    if (tag === "a") el.click = clickSpy;
    return el;
  });
  return clickSpy;
}

function makeHandle(name: string, overrides: Partial<globalThis.FileSystemFileHandle> = {}): globalThis.FileSystemFileHandle {
  return {
    kind: "file",
    name,
    getFile: vi.fn(),
    createWritable: vi.fn().mockResolvedValue({ write: vi.fn(), close: vi.fn() }),
    queryPermission: vi.fn().mockResolvedValue("granted"),
    requestPermission: vi.fn().mockResolvedValue("granted"),
    ...overrides,
  } as globalThis.FileSystemFileHandle;
}

const baseProps = {
  showToast: vi.fn(),
  importPanelOpen: false,
  onToggleImportPanel: vi.fn(),
};

describe("BackupControls — File System Access save/load", () => {
  beforeEach(() => { installMemoryLocalStorage(); });
  afterEach(() => {
    // @ts-expect-error test cleanup
    delete window.showSaveFilePicker;
    // @ts-expect-error test cleanup
    delete window.showOpenFilePicker;
    clearLinkedHandle();
    vi.restoreAllMocks();
    restoreLocalStorage();
  });

  it("falls back to a plain download when the API is unsupported", async () => {
    const clickSpy = mockAnchorClick();
    const showToast = vi.fn();

    render(<BackupControls {...baseProps} showToast={showToast} />);
    fireEvent.click(screen.getByText("↓ Export backup"));

    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(clickSpy).toHaveBeenCalled();
    expect(showToast.mock.calls[0][0].title).toBe("Backup exported");
  });

  it("exports what's saved, trade ledger and Binder exclude list included, on the v1 envelope", async () => {
    let captured = "";
    const OrigBlob = globalThis.Blob;
    vi.spyOn(globalThis, "Blob").mockImplementation(function (parts?: BlobPart[], opts?: BlobPropertyBag) {
      captured = String(parts?.[0] ?? "");
      return new OrigBlob(parts, opts);
    } as unknown as typeof Blob);
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    mockAnchorClick();
    const entry = { id: "e1", date: 1, cardsOut: [], cardsIn: [], cash: { out: 0, in: 3 }, totals: { out: 0, in: 3 } };
    const storage = window.localStorage;
    storage.setItem("mtg-checklist-trade-ledger-v1", JSON.stringify([entry]));
    storage.setItem("mtg-checklist-binder-excluded-v1", JSON.stringify(["sol ring"]));
    render(<BackupControls {...baseProps} />);
    fireEvent.click(screen.getByText("↓ Export backup"));
    await waitFor(() => expect(captured).not.toBe(""));
    const payload = JSON.parse(captured);
    expect(payload.version).toBe(1);
    expect(payload.tradeLedger).toEqual([entry]);
    expect(payload.binderExcluded).toEqual(["sol ring"]);
  });

  it("opens the save picker on first export, then writes silently and shows the linked chip", async () => {
    const handle = makeHandle("fetchlist-backup.json");
    const showSaveFilePicker = vi.fn().mockResolvedValue(handle);
    window.showSaveFilePicker = showSaveFilePicker;
    const showToast = vi.fn();

    render(<BackupControls {...baseProps} showToast={showToast} />);
    fireEvent.click(screen.getByText("↓ Export backup"));

    await waitFor(() => expect(showSaveFilePicker).toHaveBeenCalledTimes(1));
    await screen.findByText(/linked: fetchlist-backup\.json/);
    expect(showToast.mock.calls[0][0].title).toBe("Saved to file");

    // Second export reuses the handle without prompting again
    fireEvent.click(screen.getByText("↓ Export backup"));
    await waitFor(() => expect(handle.createWritable).toHaveBeenCalledTimes(2));
    expect(showSaveFilePicker).toHaveBeenCalledTimes(1);
  });

  it("does not fall back to download when the user cancels the save picker", async () => {
    const abortError = new DOMException("cancelled", "AbortError");
    window.showSaveFilePicker = vi.fn().mockRejectedValue(abortError);
    const clickSpy = mockAnchorClick();
    const showToast = vi.fn();

    render(<BackupControls {...baseProps} showToast={showToast} />);
    fireEvent.click(screen.getByText("↓ Export backup"));

    await waitFor(() => expect(window.showSaveFilePicker).toHaveBeenCalled());
    expect(clickSpy).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe("BackupControls — demo mode", () => {
  afterEach(() => { vi.restoreAllMocks(); restoreLocalStorage(); });

  it("disables export and import and explains why, without downloading anything", () => {
    installMemoryLocalStorage().setItem("fetchlist:demo:active", "true");
    const clickSpy = mockAnchorClick();

    render(<BackupControls {...baseProps} />);

    const exportBtn = screen.getByText("↓ Export backup");
    const importBtn = screen.getByText("↑ Import backup");
    expect(exportBtn).toBeDisabled();
    expect(importBtn).toBeDisabled();
    expect(screen.getByText("Exit demo mode to back up your data")).toBeInTheDocument();
    fireEvent.click(exportBtn);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("leaves the controls enabled outside demo mode", () => {
    installMemoryLocalStorage();
    render(<BackupControls {...baseProps} />);
    expect(screen.getByText("↓ Export backup")).toBeEnabled();
    expect(screen.queryByText("Exit demo mode to back up your data")).not.toBeInTheDocument();
  });
});

