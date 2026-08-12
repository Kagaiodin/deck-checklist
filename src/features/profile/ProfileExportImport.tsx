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

  showToast: (t: ToastInput) => void;

  // Import lives in a top-level modal (ImportBackupModal) — this button just opens it
  importPanelOpen: boolean;
  onToggleImportPanel: () => void;
}

export function ProfileExportImport({
  decks, allErrors, collection, collectionMeta, orders, vendorHistory,
  showToast,
  importPanelOpen, onToggleImportPanel,
}: Props) {
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

  return (
    <div className="profile-export-import">
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
    </div>
  );
}
