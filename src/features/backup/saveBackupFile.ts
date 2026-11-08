// Export: writes a Backup to the linked file where the browser supports it (File System Access),
// otherwise downloads it. Both export buttons (sidebar and mobile deck picker) use this.

import type { ToastInput } from "../../types/index";
import { supportsFileSystemAccess, getLinkedFileName, pickSaveHandle, writeLinkedFile } from "../../utils/fileSystemAccess";
import { buildBackup } from "./backup";
import { saveToast } from "./backupMessages";

export type SaveResult =
  | { kind: "linked"; fileName: string | null }
  | { kind: "downloaded"; fileName: string }
  | { kind: "cancelled" }
  | { kind: "demo" };

export function backupFileName(now: Date = new Date()): string {
  return `fetchlist-backup-${now.toISOString().slice(0, 10)}.json`;
}

export async function saveBackupFile(storage: Storage = window.localStorage): Promise<SaveResult> {
  const backup = buildBackup(storage);
  if (!backup) return { kind: "demo" };
  const fileName = backupFileName();
  const contents = JSON.stringify(backup, null, 2);

  if (supportsFileSystemAccess()) {
    try {
      if (!getLinkedFileName()) await pickSaveHandle(fileName);
      await writeLinkedFile(contents);
      return { kind: "linked", fileName: getLinkedFileName() };
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return { kind: "cancelled" }; // user dismissed the picker
      // fall through to the download below
    }
  }

  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: fileName }).click();
  URL.revokeObjectURL(url);
  return { kind: "downloaded", fileName };
}

/** Exports and tells the user how it went. Both export buttons call this. */
export async function exportBackup(showToast: (t: ToastInput) => void): Promise<SaveResult> {
  const result = await saveBackupFile();
  const toast = saveToast(result);
  if (toast) showToast(toast);
  return result;
}
