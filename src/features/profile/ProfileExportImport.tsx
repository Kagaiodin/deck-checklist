import { useRef, useState } from "react";
import type { Deck, ErrorQueueItem, Collection, CollectionMeta, Order, ProfileExport } from "../../types/index";
import "./ProfileExportImport.css";

export interface ToastInput {
  title: string;
  sub?: string;
  variant: "success" | "warn" | "neutral";
  autoDismiss?: number;
}

interface Props {
  // Data for export
  decks: Deck[];
  allErrors: Record<string, ErrorQueueItem[]>;
  collection: Collection;
  collectionMeta: CollectionMeta | null;
  orders: Order[];
  vendorHistory: string[];

  // Import handler lives in App — returns new-item counts for the toast
  onImport: (data: ProfileExport, replace: boolean) => { newDecks: number; newCards: number; newOrders: number };
  showToast: (t: ToastInput) => void;

  // Panel open state is lifted to App so sidebar + mobile sheet share one panel
  importPanelOpen: boolean;
  onToggleImportPanel: () => void;

  // When true, suppress the sidebar-footer button row (used in mobile sheet
  // where the buttons live in the sheet footer instead)
  hideFooter?: boolean;
}

export function ProfileExportImport({
  decks, allErrors, collection, collectionMeta, orders, vendorHistory,
  onImport, showToast,
  importPanelOpen, onToggleImportPanel,
  hideFooter = false,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  // ── Export ───────────────────────────────────────────────────────────────────
  function handleExport() {
    const filename = `fetchlist-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const payload: ProfileExport = {
      version: 1,
      exportedAt: new Date().toISOString(),
      decks,
      errors: allErrors,
      collection,
      collectionMeta,
      orders,
      vendorHistory,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: filename }).click();
    URL.revokeObjectURL(url);
    showToast({ title: "Profile exported", sub: filename, variant: "success", autoDismiss: 2000 });
  }

  // ── Import ───────────────────────────────────────────────────────────────────
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const raw = JSON.parse(ev.target?.result as string);

        // Shape validation
        if (!raw || typeof raw !== "object" || !raw.version ||
            (!raw.decks && !raw.collection && !raw.orders)) {
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

        // Reset panel
        setPanelError(null);
        setReplaceMode(false);
        onToggleImportPanel();
      } catch {
        setPanelError("File could not be read. Make sure it's a Fetchlist backup (.json).");
      }
    };
    reader.readAsText(file);
  }

  function handleCancel() {
    onToggleImportPanel();
    setPanelError(null);
    setReplaceMode(false);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className={hideFooter ? "profile-export-import-panel-only" : "profile-export-import"}>
      {/* Hidden file input — triggered programmatically via ref */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />

      {/* Footer row — hidden in mobile-sheet context (buttons live in deck-picker-footer instead) */}
      {!hideFooter && (
        <div className="sidebar-footer">
          <button className="btn btn-ghost btn-sm" onClick={handleExport}>
            ↓ Export data
          </button>
          <button
            className={`btn btn-ghost btn-sm${importPanelOpen ? " active" : ""}`}
            onClick={onToggleImportPanel}
          >
            ↑ Import data
          </button>
        </div>
      )}

      {/* Inline import panel */}
      {importPanelOpen && (
        <div className="profile-import-panel">
          <span className="profile-import-panel-title">Import backup</span>
          <p className="profile-import-hint">
            Select a <code>fetchlist-backup-*.json</code> file. New items will be merged with your existing data.
          </p>

          <div className={`profile-replace-row${replaceMode ? " is-destructive" : ""}`}>
            <input
              type="checkbox"
              id="profile-replace-chk"
              checked={replaceMode}
              onChange={e => setReplaceMode(e.target.checked)}
            />
            <label className="profile-replace-label" htmlFor="profile-replace-chk">
              Replace all local data
              <small>
                {replaceMode
                  ? "This will wipe all existing decks, collection, and orders."
                  : "Wipes existing decks, collection, and orders before importing."}
              </small>
            </label>
          </div>

          {panelError && (
            <p className="import-error-inline" role="alert">{panelError}</p>
          )}

          <div className="profile-import-actions">
            <button
              className="btn btn-sm"
              style={{
                flex: 1,
                ...(replaceMode
                  ? { borderColor: "var(--danger)", color: "var(--danger)" }
                  : { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }),
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              {replaceMode ? "Choose file & replace" : "Choose file"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
