import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ImportBackupModal } from "../ImportBackupModal";
import { clearLinkedHandle } from "../../../utils/fileSystemAccess";

const baseProps = {
  onImport: vi.fn(() => ({ newDecks: 1, newCards: 0, newOrders: 0 })),
  showToast: vi.fn(),
  onClose: vi.fn(),
};

function uploadFile(input: Element, contents: string, name = "fetchlist-backup-2026-01-01.json") {
  const file = new File([contents], name, { type: "application/json" });
  fireEvent.change(input, { target: { files: [file] } });
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

describe("ImportBackupModal", () => {
  afterEach(() => {
    // @ts-expect-error test cleanup
    delete window.showSaveFilePicker;
    // @ts-expect-error test cleanup
    delete window.showOpenFilePicker;
    clearLinkedHandle();
    vi.restoreAllMocks();
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(<ImportBackupModal {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<ImportBackupModal {...baseProps} onClose={onClose} />);
    fireEvent.click(document.querySelector(".import-backup-backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when the modal body is clicked", () => {
    const onClose = vi.fn();
    render(<ImportBackupModal {...baseProps} onClose={onClose} />);
    fireEvent.click(document.querySelector(".import-backup-modal")!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<ImportBackupModal {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("switches to destructive styling and label when 'Replace all local data' is checked", () => {
    render(<ImportBackupModal {...baseProps} />);
    fireEvent.click(screen.getByLabelText(/Replace all local data/));
    expect(screen.getByRole("button", { name: "Choose file & replace" })).toBeInTheDocument();
  });

  it("shows an inline error for a file that isn't a Fetchlist backup", async () => {
    render(<ImportBackupModal {...baseProps} />);
    const input = document.querySelector('input[type="file"]')!;
    uploadFile(input, JSON.stringify({ foo: "bar" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("This doesn't look like a Fetchlist backup file.");
    });
  });

  it("imports a valid backup, toasts, and closes", async () => {
    const onImport = vi.fn(() => ({ newDecks: 2, newCards: 3, newOrders: 0 }));
    const showToast = vi.fn();
    const onClose = vi.fn();
    render(<ImportBackupModal {...baseProps} onImport={onImport} showToast={showToast} onClose={onClose} />);

    const input = document.querySelector('input[type="file"]')!;
    uploadFile(input, JSON.stringify({ version: 1, decks: [] }));

    await waitFor(() => expect(onImport).toHaveBeenCalledWith({ version: 1, decks: [] }, false));
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Import complete", sub: "2 decks · 3 collection cards added" })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses the File System Access open picker when supported, instead of the hidden input", async () => {
    const payload = { version: 1, decks: [], collection: {}, orders: [] };
    const handle = makeHandle("fetchlist-backup.json", {
      getFile: vi.fn().mockResolvedValue({ text: () => Promise.resolve(JSON.stringify(payload)) }),
    });
    window.showSaveFilePicker = vi.fn(); // supportsFileSystemAccess() gates on this existing
    window.showOpenFilePicker = vi.fn().mockResolvedValue([handle]);
    const onImport = vi.fn().mockReturnValue({ newDecks: 1, newCards: 0, newOrders: 0 });
    const onClose = vi.fn();

    render(<ImportBackupModal {...baseProps} onImport={onImport} onClose={onClose} />);
    fireEvent.click(screen.getByText("Choose file"));

    await waitFor(() => expect(onImport).toHaveBeenCalledWith(payload, false));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows an inline error for unparseable JSON", async () => {
    render(<ImportBackupModal {...baseProps} />);
    uploadFile(document.querySelector('input[type="file"]')!, "{not json");
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("File could not be read.");
    });
  });

  it("warns about newer backup versions but still imports", async () => {
    const onImport = vi.fn(() => ({ newDecks: 1, newCards: 0, newOrders: 0 }));
    const showToast = vi.fn();
    render(<ImportBackupModal {...baseProps} onImport={onImport} showToast={showToast} />);
    uploadFile(document.querySelector('input[type="file"]')!, JSON.stringify({ version: 2, decks: [] }));
    await waitFor(() => expect(onImport).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Newer backup format", variant: "warn" }));
  });

  it("toasts 'Nothing new' when every count is zero", async () => {
    const onImport = vi.fn(() => ({ newDecks: 0, newCards: 0, newOrders: 0 }));
    const showToast = vi.fn();
    render(<ImportBackupModal {...baseProps} onImport={onImport} showToast={showToast} />);
    uploadFile(document.querySelector('input[type="file"]')!, JSON.stringify({ version: 1, decks: [] }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Nothing new to import", variant: "neutral" }),
    ));
  });

  it("pluralises and includes orders in the summary", async () => {
    const onImport = vi.fn(() => ({ newDecks: 1, newCards: 0, newOrders: 2 }));
    const showToast = vi.fn();
    render(<ImportBackupModal {...baseProps} onImport={onImport} showToast={showToast} />);
    uploadFile(document.querySelector('input[type="file"]')!, JSON.stringify({ version: 1, orders: [] }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ sub: "1 deck · 2 orders added" }),
    ));
  });

  it("passes replace=true when 'Replace all local data' is checked", async () => {
    const onImport = vi.fn(() => ({ newDecks: 1, newCards: 0, newOrders: 0 }));
    render(<ImportBackupModal {...baseProps} onImport={onImport} />);
    fireEvent.click(screen.getByLabelText(/Replace all local data/));
    expect(screen.getByText("This will wipe all existing decks, collection, and orders.")).toBeInTheDocument();
    uploadFile(document.querySelector('input[type="file"]')!, JSON.stringify({ version: 1, decks: [] }));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith({ version: 1, decks: [] }, true));
  });

  it("ignores a change event with no file selected", () => {
    const onImport = vi.fn();
    render(<ImportBackupModal {...baseProps} onImport={onImport} />);
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [] } });
    expect(onImport).not.toHaveBeenCalled();
  });

  it("stays silent when the user dismisses the native picker", async () => {
    window.showSaveFilePicker = vi.fn();
    window.showOpenFilePicker = vi.fn().mockRejectedValue(new DOMException("cancel", "AbortError"));
    render(<ImportBackupModal {...baseProps} />);
    fireEvent.click(screen.getByText("Choose file"));
    await waitFor(() => expect(window.showOpenFilePicker).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an error when the native picker fails for another reason", async () => {
    window.showSaveFilePicker = vi.fn();
    window.showOpenFilePicker = vi.fn().mockRejectedValue(new Error("boom"));
    render(<ImportBackupModal {...baseProps} />);
    fireEvent.click(screen.getByText("Choose file"));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("File could not be read.");
    });
  });
});
