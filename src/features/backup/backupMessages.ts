// What the user is told about backups: toasts after an export or import, and import errors.
// Wording lives here so copy changes don't touch the import logic in backup.ts.

import type { ImportCounts, ToastInput } from "../../types/index";
import { DEMO_BACKUP_HINT } from "../demo/demoMode";
import type { SaveResult } from "./saveBackupFile";

/** Where an import came from; it picks the toast. */
export type ImportSource = "file" | "drive" | "drive-conflict";

/** The toasts an import shows once the page has reloaded. */
export function importToasts(source: ImportSource, counts: ImportCounts, newerVersion: boolean): ToastInput[] {
  const toasts: ToastInput[] = [];
  if (newerVersion) toasts.push({ title: "Newer backup format", sub: "Some data may not import correctly.", variant: "warn" });
  if (source === "drive") toasts.push({ title: "Loaded from Drive", variant: "success", autoDismiss: 2000 });
  else if (source === "drive-conflict") toasts.push({ title: "Loaded Drive version", variant: "success", autoDismiss: 2000 });
  else {
    const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? "s" : ""}`;
    const parts: string[] = [];
    if (counts.newDecks > 0) parts.push(plural(counts.newDecks, "deck"));
    if (counts.newCards > 0) parts.push(`${counts.newCards} collection cards`);
    if (counts.newOrders > 0) parts.push(plural(counts.newOrders, "order"));
    if (counts.newTrades) parts.push(plural(counts.newTrades, "trade"));
    toasts.push(parts.length === 0
      ? { title: "Nothing new to import", sub: "All items already exist locally.", variant: "neutral", autoDismiss: 3000 }
      : { title: "Import complete", sub: `${parts.join(" · ")} added`, variant: "success" });
  }
  return toasts;
}

/** Why a picked file couldn't be imported. */
export function backupFileError(error: "unreadable" | "not-a-backup" | "bad-field"): string {
  switch (error) {
    case "unreadable": return "File could not be read. Make sure it's a Fetchlist backup (.json).";
    case "not-a-backup": return "This doesn't look like a Fetchlist backup file.";
    case "bad-field": return "Part of this backup is damaged, so nothing was imported.";
  }
}

export const DRIVE_BACKUP_UNREADABLE = "The Drive backup couldn't be read.";

/** Why a valid backup couldn't be written. */
export function importFailure(reason: "demo" | "storage"): string {
  return reason === "storage" ? "There isn't enough storage space for this backup. Nothing was changed." : DEMO_BACKUP_HINT;
}

/** The toast for a finished export, or null when there is nothing to say. */
export function saveToast(result: SaveResult): ToastInput | null {
  switch (result.kind) {
    case "linked": return { title: "Saved to file", sub: result.fileName ?? undefined, variant: "success", autoDismiss: 2000 };
    case "downloaded": return { title: "Backup exported", sub: result.fileName, variant: "success", autoDismiss: 2000 };
    default: return null;
  }
}
