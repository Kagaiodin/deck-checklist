import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProfileExportImport } from "../ProfileExportImport";
import { clearLinkedHandle } from "../../../utils/fileSystemAccess";

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
  decks: [],
  allErrors: {},
  collection: {},
  collectionMeta: null,
  orders: [],
  vendorHistory: [],
  onImport: vi.fn().mockReturnValue({ newDecks: 0, newCards: 0, newOrders: 0 }),
  showToast: vi.fn(),
  importPanelOpen: false,
  onToggleImportPanel: vi.fn(),
};

describe("ProfileExportImport — File System Access save/load", () => {
  afterEach(() => {
    // @ts-expect-error test cleanup
    delete window.showSaveFilePicker;
    // @ts-expect-error test cleanup
    delete window.showOpenFilePicker;
    clearLinkedHandle();
    vi.restoreAllMocks();
  });

  it("falls back to a plain download when the API is unsupported", async () => {
    const clickSpy = mockAnchorClick();
    const showToast = vi.fn();

    render(<ProfileExportImport {...baseProps} showToast={showToast} />);
    fireEvent.click(screen.getByText("↓ Export backup"));

    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(clickSpy).toHaveBeenCalled();
    expect(showToast.mock.calls[0][0].title).toBe("Profile exported");
  });

  it("opens the save picker on first export, then writes silently and shows the linked chip", async () => {
    const handle = makeHandle("fetchlist-backup.json");
    const showSaveFilePicker = vi.fn().mockResolvedValue(handle);
    window.showSaveFilePicker = showSaveFilePicker;
    const showToast = vi.fn();

    render(<ProfileExportImport {...baseProps} showToast={showToast} />);
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

    render(<ProfileExportImport {...baseProps} showToast={showToast} />);
    fireEvent.click(screen.getByText("↓ Export backup"));

    await waitFor(() => expect(window.showSaveFilePicker).toHaveBeenCalled());
    expect(clickSpy).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("loads via the open picker and imports the parsed backup", async () => {
    const payload = { version: 1, decks: [], collection: {}, orders: [] };
    const handle = makeHandle("fetchlist-backup.json", {
      getFile: vi.fn().mockResolvedValue({ text: () => Promise.resolve(JSON.stringify(payload)) }),
    });
    window.showSaveFilePicker = vi.fn(); // supportsFileSystemAccess() gates on this existing
    window.showOpenFilePicker = vi.fn().mockResolvedValue([handle]);
    const onImport = vi.fn().mockReturnValue({ newDecks: 1, newCards: 0, newOrders: 0 });
    const onToggleImportPanel = vi.fn();

    render(
      <ProfileExportImport
        {...baseProps}
        importPanelOpen={true}
        onImport={onImport}
        onToggleImportPanel={onToggleImportPanel}
      />
    );

    fireEvent.click(screen.getByText("Choose file"));

    await waitFor(() => expect(onImport).toHaveBeenCalledWith(payload, false));
    expect(onToggleImportPanel).toHaveBeenCalled();
  });
});
