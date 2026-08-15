import { useEffect, useRef, useState } from "react";
import type { ProfileExport } from "../../types/index";
import type { ToastInput } from "./ProfileExportImport";
import { supportsFileSystemAccess, pickOpenHandle, readLinkedFile } from "../../utils/fileSystemAccess";
import "./ImportBackupModal.css";

interface Props {
  onImport: (data: ProfileExport, replace: boolean) => { newDecks: number; newCards: number; newOrders: number };
  showToast: (t: ToastInput) => void;
  onClose: () => void;
}

export function ImportBackupModal({ onImport, showToast, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const chooseFileRef = useRef<HTMLButtonElement>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const fsaSupported = supportsFileSystemAccess();

  // Focus trap + Escape key — same pattern as OnboardingModal
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    chooseFileRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const modal = modalRef.current;
      if (!modal) return;
      const focusable = modal.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      prev?.focus();
    };
  }, [onClose]);

  function processImportedJson(rawText: string): void {
    let raw: unknown;
    try {
      raw = JSON.parse(rawText);
    } catch {
      setPanelError("File could not be read. Make sure it's a Fetchlist backup (.json).");
      return;
    }

    // Shape validation
    if (!raw || typeof raw !== "object" || !("version" in raw) ||
        !("decks" in raw || "collection" in raw || "orders" in raw)) {
      setPanelError("This doesn't look like a Fetchlist backup file.");
      return;
    }

    const data = raw as ProfileExport;

    // Warn for future versions but still attempt import
    if ((data.version as number) > 1) {
      showToast({
        title: "Newer backup format",
        sub: "Some data may not import correctly.",
        variant: "warn",
      });
    }

    const counts = onImport(data, replaceMode);

    // Build toast summary — omit zero-count domains
    const parts: string[] = [];
    if (counts.newDecks > 0) parts.push(`${counts.newDecks} deck${counts.newDecks !== 1 ? "s" : ""}`);
    if (counts.newCards > 0) parts.push(`${counts.newCards} collection cards`);
    if (counts.newOrders > 0) parts.push(`${counts.newOrders} order${counts.newOrders !== 1 ? "s" : ""}`);

    if (parts.length === 0) {
      showToast({
        title: "Nothing new to import",
        sub: "All items already exist locally.",
        variant: "neutral",
        autoDismiss: 3000,
      });
    } else {
      showToast({ title: "Import complete", sub: `${parts.join(" · ")} added`, variant: "success" });
    }

    onClose();
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = ev => processImportedJson(ev.target?.result as string);
    reader.readAsText(file);
  }

  async function handleChooseFile() {
    if (!fsaSupported) {
      fileInputRef.current?.click();
      return;
    }
    try {
      await pickOpenHandle();
      const text = await readLinkedFile();
      processImportedJson(text);
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return; // user dismissed the picker
      setPanelError("File could not be read. Make sure it's a Fetchlist backup (.json).");
    }
  }

  return (
    <div
      className="import-backup-backdrop"
      aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="import-backup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-backup-title"
        ref={modalRef}
      >
        <button className="import-backup-close" aria-label="Close" onClick={onClose}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M1 1l12 12M13 1L1 13" />
          </svg>
        </button>

        <span className="import-backup-title" id="import-backup-title">Import backup</span>
        <p className="import-backup-hint">
          Select a <code>fetchlist-backup-*.json</code> file. New items will be merged with your existing data.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />

        <div className={`import-backup-replace-row${replaceMode ? " is-destructive" : ""}`}>
          <input
            type="checkbox"
            id="import-backup-replace-chk"
            checked={replaceMode}
            onChange={e => setReplaceMode(e.target.checked)}
          />
          <label className="import-backup-replace-label" htmlFor="import-backup-replace-chk">
            Replace all local data
            <small>
              {replaceMode
                ? "This will wipe all existing decks, collection, and orders."
                : "Wipes existing decks, collection, and orders before importing."}
            </small>
          </label>
        </div>

        {panelError && (
          <p className="import-backup-error" role="alert">{panelError}</p>
        )}

        <div className="import-backup-actions">
          <button
            className={`btn btn-sm${replaceMode ? " import-backup-btn-danger" : " btn-primary"}`}
            style={{ flex: 1 }}
            onClick={handleChooseFile}
            ref={chooseFileRef}
          >
            {replaceMode ? "Choose file & replace" : "Choose file"}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
