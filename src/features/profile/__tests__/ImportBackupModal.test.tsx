import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ImportBackupModal } from "../ImportBackupModal";

const baseProps = {
  onImport: vi.fn(() => ({ newDecks: 1, newCards: 0, newOrders: 0 })),
  showToast: vi.fn(),
  onClose: vi.fn(),
};

function uploadFile(input: Element, contents: string, name = "fetchlist-backup-2026-01-01.json") {
  const file = new File([contents], name, { type: "application/json" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("ImportBackupModal", () => {
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
});
