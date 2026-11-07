import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ImportBackupModal } from "../ImportBackupModal";
import { clearLinkedHandle } from "../../../utils/fileSystemAccess";
import { installMemoryLocalStorage, restoreLocalStorage, type MemoryStorage } from "../../demo/__tests__/memoryStorage";
import { page } from "../../../utils/page";

// The modal's own behaviour: picking a file, errors, merge vs replace. What an import writes and
// which toast it leaves are covered in backup.test.ts.

const baseProps = { onClose: vi.fn() };
const DECKS_KEY = "mtg-checklist-decks";
const deck = (id: string) => ({ id, name: id, cards: [] });
const flash = () => JSON.parse(sessionStorage.getItem("fetchlist:backup:flash") ?? "null");

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
  let storage: MemoryStorage;
  let reload: Mock<() => void>;
  beforeEach(() => {
    storage = installMemoryLocalStorage();
    reload = vi.fn<() => void>();
    vi.spyOn(page, "reload").mockImplementation(reload);
  });
  afterEach(() => {
    restoreLocalStorage();
    sessionStorage.clear();
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

  it("merges a valid backup, leaves the summary toast for after the reload, and closes", async () => {
    storage.setItem(DECKS_KEY, JSON.stringify([deck("mine")]));
    const onClose = vi.fn();
    render(<ImportBackupModal onClose={onClose} />);

    uploadFile(document.querySelector('input[type="file"]')!, JSON.stringify({ version: 1, decks: [deck("mine"), deck("new")] }));

    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(JSON.parse(storage.getItem(DECKS_KEY)!).map((d: { id: string }) => d.id)).toEqual(["mine", "new"]);
    expect(flash()).toEqual([expect.objectContaining({ title: "Import complete", sub: "1 deck added" })]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses the File System Access open picker when supported, instead of the hidden input", async () => {
    const payload = { version: 1, decks: [deck("new")], collection: {}, orders: [] };
    const handle = makeHandle("fetchlist-backup.json", {
      getFile: vi.fn().mockResolvedValue({ text: () => Promise.resolve(JSON.stringify(payload)) }),
    });
    window.showSaveFilePicker = vi.fn(); // supportsFileSystemAccess() gates on this existing
    window.showOpenFilePicker = vi.fn().mockResolvedValue([handle]);
    const onClose = vi.fn();

    render(<ImportBackupModal onClose={onClose} />);
    fireEvent.click(screen.getByText("Choose file"));

    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(JSON.parse(storage.getItem(DECKS_KEY)!)).toEqual([deck("new")]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows an inline error for unparseable JSON", async () => {
    render(<ImportBackupModal {...baseProps} />);
    uploadFile(document.querySelector('input[type="file"]')!, "{not json");
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("File could not be read.");
    });
  });

  it("rejects a backup with a damaged field and changes nothing", async () => {
    storage.setItem(DECKS_KEY, JSON.stringify([deck("mine")]));
    render(<ImportBackupModal {...baseProps} />);
    uploadFile(document.querySelector('input[type="file"]')!, JSON.stringify({ version: 1, decks: [], orders: "oops" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Part of this backup is damaged, so nothing was imported."));
    expect(JSON.parse(storage.getItem(DECKS_KEY)!)).toEqual([deck("mine")]);
    expect(reload).not.toHaveBeenCalled();
  });

  it("warns about newer backup versions but still imports", async () => {
    render(<ImportBackupModal {...baseProps} />);
    uploadFile(document.querySelector('input[type="file"]')!, JSON.stringify({ version: 2, decks: [] }));
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(flash()).toContainEqual(expect.objectContaining({ title: "Newer backup format", variant: "warn" }));
  });

  it("replaces all local data when 'Replace all local data' is checked", async () => {
    storage.setItem(DECKS_KEY, JSON.stringify([deck("mine")]));
    render(<ImportBackupModal {...baseProps} />);
    fireEvent.click(screen.getByLabelText(/Replace all local data/));
    expect(screen.getByText("This will wipe all existing decks, collection, orders, and trades.")).toBeInTheDocument();
    uploadFile(document.querySelector('input[type="file"]')!, JSON.stringify({ version: 1, decks: [deck("new")] }));
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(JSON.parse(storage.getItem(DECKS_KEY)!)).toEqual([deck("new")]);
  });

  it("shows an error and keeps the modal open when storage is full", async () => {
    storage.setItem(DECKS_KEY, JSON.stringify([deck("mine")]));
    storage.failOn.add("mtg-checklist-orders-v1");
    const onClose = vi.fn();
    render(<ImportBackupModal onClose={onClose} />);
    uploadFile(document.querySelector('input[type="file"]')!, JSON.stringify({ version: 1, decks: [deck("new")] }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("There isn't enough storage space"));
    expect(JSON.parse(storage.getItem(DECKS_KEY)!)).toEqual([deck("mine")]);
    expect(onClose).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("ignores a change event with no file selected", () => {
    render(<ImportBackupModal {...baseProps} />);
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [] } });
    expect(reload).not.toHaveBeenCalled();
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
