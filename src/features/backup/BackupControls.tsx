import { useEffect, useState } from "react";
import type { ToastInput } from "../../types/index";
import { getLinkedFileName, pickSaveHandle } from "../../utils/fileSystemAccess";
import { GoogleDriveBackup } from "./GoogleDriveBackup";
import { backupFileName, exportBackup } from "./saveBackupFile";
import "./BackupControls.css";
import { isDemoActiveNow, DEMO_BACKUP_HINT } from "../demo/demoMode";
import "../demo/demo.css";

interface Props {
  showToast: (t: ToastInput) => void;

  // Import lives in a top-level modal (ImportBackupModal) — this button just opens it
  importPanelOpen: boolean;
  onToggleImportPanel: () => void;
}

/** The sidebar's backup buttons: export, import, and Google Drive. The backup itself comes from storage (backup.ts). */
export function BackupControls({ showToast, importPanelOpen, onToggleImportPanel }: Props) {
  const [linkedFileName, setLinkedFileName] = useState<string | null>(getLinkedFileName());
  const demo = isDemoActiveNow();

  // ImportBackupModal can link a new file via the FSA open picker (Tier 1)
  // during import — that handle lives at module scope, so re-sync our local
  // chip state whenever the modal closes.
  useEffect(() => {
    if (!importPanelOpen) setLinkedFileName(getLinkedFileName());
  }, [importPanelOpen]);

  async function handleExport() {
    const result = await exportBackup(showToast);
    if (result.kind === "linked") setLinkedFileName(result.fileName);
  }

  async function handleChangeLinkedFile() {
    try {
      await pickSaveHandle(backupFileName());
      setLinkedFileName(getLinkedFileName());
    } catch (err) {
      if ((err as DOMException)?.name !== "AbortError") throw err;
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="backup-controls">
      <div className="sidebar-footer-group">
        {linkedFileName && (
          <div className="linked-file-chip">
            <span className="linked-file-chip-name" title={linkedFileName}>📎 linked: {linkedFileName}</span>
            <button className="linked-file-chip-change" onClick={handleChangeLinkedFile}>change</button>
          </div>
        )}
        <div className="sidebar-footer">
          <button className="btn btn-ghost btn-sm" onClick={handleExport} disabled={demo}>
            ↓ Export backup
          </button>
          <button
            className={`btn btn-ghost btn-sm${importPanelOpen ? " active" : ""}`}
            onClick={onToggleImportPanel}
            disabled={demo}
          >
            ↑ Import backup
          </button>
        </div>
        {demo && <p className="demo-backup-hint">{DEMO_BACKUP_HINT}</p>}
        <GoogleDriveBackup showToast={showToast} variant="sidebar" />
      </div>
    </div>
  );
}
