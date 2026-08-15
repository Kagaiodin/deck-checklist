import { useEffect, useState } from "react";
import type { Deck, ErrorQueueItem, Collection, CollectionMeta, Order, ProfileExport } from "../../types/index";
import {
  supportsFileSystemAccess, getLinkedFileName,
  pickSaveHandle, writeLinkedFile,
} from "../../utils/fileSystemAccess";
import { GoogleDriveBackup } from "./GoogleDriveBackup";
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

  // Passed through to GoogleDriveBackup, which manages its own import flow
  onImport: (data: ProfileExport, replace: boolean) => { newDecks: number; newCards: number; newOrders: number };
  showToast: (t: ToastInput) => void;

  // Import lives in a top-level modal (ImportBackupModal) — this button just opens it
  importPanelOpen: boolean;
  onToggleImportPanel: () => void;
}

export function ProfileExportImport({
  decks, allErrors, collection, collectionMeta, orders, vendorHistory,
  onImport, showToast,
  importPanelOpen, onToggleImportPanel,
}: Props) {
  const [linkedFileName, setLinkedFileName] = useState<string | null>(getLinkedFileName());
  const fsaSupported = supportsFileSystemAccess();

  // ImportBackupModal can link a new file via the FSA open picker (Tier 1)
  // during import — that handle lives at module scope, so re-sync our local
  // chip state whenever the modal closes.
  useEffect(() => {
    if (!importPanelOpen) setLinkedFileName(getLinkedFileName());
  }, [importPanelOpen]);

  function buildPayload(): ProfileExport {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      decks,
      errors: allErrors,
      collection,
      collectionMeta,
      orders,
      vendorHistory,
    };
  }

  // ── Export ───────────────────────────────────────────────────────────────────
  async function handleExport() {
    const filename = `fetchlist-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const contents = JSON.stringify(buildPayload(), null, 2);

    if (fsaSupported) {
      try {
        if (!getLinkedFileName()) await pickSaveHandle(filename);
        await writeLinkedFile(contents);
        setLinkedFileName(getLinkedFileName());
        showToast({ title: "Saved to file", sub: getLinkedFileName() ?? undefined, variant: "success", autoDismiss: 2000 });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") return; // user dismissed the picker
        // fall through to the download fallback below
      }
    }

    const blob = new Blob([contents], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: filename }).click();
    URL.revokeObjectURL(url);
    showToast({ title: "Profile exported", sub: filename, variant: "success", autoDismiss: 2000 });
  }

  async function handleChangeLinkedFile() {
    try {
      await pickSaveHandle(`fetchlist-backup-${new Date().toISOString().slice(0, 10)}.json`);
      setLinkedFileName(getLinkedFileName());
    } catch (err) {
      if ((err as DOMException)?.name !== "AbortError") throw err;
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="profile-export-import">
      <div className="sidebar-footer-group">
        {linkedFileName && (
          <div className="linked-file-chip">
            <span className="linked-file-chip-name" title={linkedFileName}>📎 linked: {linkedFileName}</span>
            <button className="linked-file-chip-change" onClick={handleChangeLinkedFile}>change</button>
          </div>
        )}
        <div className="sidebar-footer">
          <button className="btn btn-ghost btn-sm" onClick={handleExport}>
            ↓ Export backup
          </button>
          <button
            className={`btn btn-ghost btn-sm${importPanelOpen ? " active" : ""}`}
            onClick={onToggleImportPanel}
          >
            ↑ Import backup
          </button>
        </div>
        <GoogleDriveBackup
          decks={decks}
          allErrors={allErrors}
          collection={collection}
          collectionMeta={collectionMeta}
          orders={orders}
          vendorHistory={vendorHistory}
          onImport={onImport}
          showToast={showToast}
          variant="sidebar"
        />
      </div>
    </div>
  );
}
