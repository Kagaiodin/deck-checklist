import { useEffect, useState } from "react";
import type { Deck } from "../../types/index";
import {
  supportsGoogleDrive, getConnectedEmail, isConnected, isExpired,
  connect, disconnect, saveToDrive, loadFromDrive, DriveError,
} from "../../utils/googleDrive";
import { DriveConflictModal } from "./DriveConflictModal";
import type { ToastInput } from "../../types/index";
import "./GoogleDriveBackup.css";
import { isDemoActiveNow, DEMO_BACKUP_HINT } from "../demo/demoMode";
import { buildBackup, hasReplaceableUserData, importBackup, parseBackup, readStoredValues, type ParsedBackupFile } from "./backup";
import { DRIVE_BACKUP_UNREADABLE, importFailure, type ImportSource } from "./backupMessages";

interface Props {
  showToast: (t: ToastInput) => void;
  // Sidebar (desktop, sibling to the Tier 1 chip) vs mobile deck-picker sheet
  // footer (its own boxed unit) — see docs/specs/google-drive-integration-design-brief.md
  variant: "sidebar" | "mobile";
}

const driveIcon = (
  <svg width="15" height="15" viewBox="0 0 87.3 78" aria-hidden="true">
    <path fill="#0066da" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" />
    <path fill="#00ac47" d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" />
    <path fill="#e94235" d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" />
    <path fill="#00832d" d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" />
    <path fill="#2684fc" d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" />
    <path fill="#ffba00" d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" />
  </svg>
);

function initialOf(email: string): string {
  return email.charAt(0).toUpperCase();
}

type DeckSummary = { deckCount: number; cardCount: number };

/** What the conflict modal shows for one side: how many decks, and card rows across them. */
function summarize(decks: Deck[]): DeckSummary {
  return { deckCount: decks.length, cardCount: decks.reduce((sum, d) => sum + d.cards.length, 0) };
}

function relativeTime(from: Date): string {
  const seconds = Math.round((Date.now() - from.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

/** Save the Backup to Drive, or load Drive's copy over this device's data. Load always replaces. */
export function GoogleDriveBackup({ showToast, variant }: Props) {
  const [status, setStatus] = useState<"idle" | "connecting" | "saving" | "loading">("idle");
  const [connectedEmail, setConnectedEmail] = useState<string | null>(getConnectedEmail());
  const [driveError, setDriveError] = useState<{ kind: DriveError["kind"]; message: string } | null>(null);
  // Only Save sets this: a Load reloads the page, and its toast says it worked.
  const [lastSync, setLastSync] = useState<{ verb: "Saved"; at: Date } | null>(null);
  // Both sides are counted when Load is clicked: Drive's from the parsed file, this device's from storage.
  const [conflict, setConflict] = useState<{ parsed: ParsedBackupFile; modifiedTime: string; local: DeckSummary } | null>(null);
  const [, forceTick] = useState(0);

  // Keep the "· 2m ago" meta line fresh without a full data refetch.
  useEffect(() => {
    if (!lastSync) return;
    const id = setInterval(() => forceTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, [lastSync]);

  if (!supportsGoogleDrive()) return null;

  if (isDemoActiveNow()) {
    return (
      <div className={`gdrive gdrive--${variant}`}>
        <button type="button" className="btn btn-secondary btn-sm gdrive-btn-block" disabled title={DEMO_BACKUP_HINT}>
          {driveIcon} Connect Google Drive
        </button>
      </div>
    );
  }

  /** Imports Drive's copy, replacing this device's data; the page reloads on success. */
  function applyDriveBackup(parsed: ParsedBackupFile, source: ImportSource): void {
    const result = importBackup(parsed, { mode: "replace", source });
    if (!result.ok) setDriveError({ kind: "unknown", message: importFailure(result.reason) });
  }

  async function handleConnect() {
    setStatus("connecting");
    setDriveError(null);
    try {
      const { email } = await connect();
      setConnectedEmail(email);
    } catch (err) {
      const e = err as DriveError;
      setDriveError({ kind: e.kind ?? "unknown", message: e.message });
    } finally {
      setStatus("idle");
    }
  }

  function handleDisconnect() {
    disconnect();
    setConnectedEmail(null);
    setDriveError(null);
    setLastSync(null);
    showToast({ title: "Disconnected from Drive", variant: "neutral", autoDismiss: 2000 });
  }

  async function handleSave() {
    setStatus("saving");
    setDriveError(null);
    try {
      const backup = buildBackup(window.localStorage);
      if (!backup) return;
      await saveToDrive(JSON.stringify(backup));
      setLastSync({ verb: "Saved", at: new Date() });
      showToast({ title: "Saved to Drive", variant: "success", autoDismiss: 2000 });
    } catch (err) {
      setDriveError(err as DriveError);
    } finally {
      setStatus("idle");
    }
  }

  async function handleLoad() {
    setStatus("loading");
    setDriveError(null);
    try {
      const result = await loadFromDrive();
      if (!result) {
        showToast({ title: "No backup in Drive yet", sub: "Save first to create one.", variant: "neutral", autoDismiss: 2500 });
        return;
      }
      // Validate before asking anything: an unreadable file shouldn't open the "Keep which version?" choice.
      const parsed = parseBackup(result.contents);
      if (!parsed.ok) {
        setDriveError({ kind: "unknown", message: DRIVE_BACKUP_UNREADABLE });
      } else if (hasReplaceableUserData(window.localStorage)) {
        setConflict({ parsed, modifiedTime: result.modifiedTime, local: summarize(readStoredValues(window.localStorage).decks) });
      } else {
        applyDriveBackup(parsed, "drive");
      }
    } catch (err) {
      setDriveError(err as DriveError);
    } finally {
      setStatus("idle");
    }
  }

  function resolveKeepDrive() {
    if (!conflict) return;
    setConflict(null);
    applyDriveBackup(conflict.parsed, "drive-conflict");
  }

  function resolveKeepLocal() {
    setConflict(null);
    showToast({ title: "Kept this device's data", variant: "neutral", autoDismiss: 2000 });
  }

  function errorAction(): { label: string; onClick: () => void } {
    if (!driveError) return { label: "Reconnect", onClick: handleConnect };
    switch (driveError.kind) {
      case "offline": return { label: "Retry", onClick: () => setDriveError(null) };
      case "quota": return { label: "Manage Drive storage ↗", onClick: () => window.open("https://drive.google.com", "_blank", "noopener") };
      default: return { label: "Reconnect", onClick: handleConnect };
    }
  }

  const connected = isConnected();
  const expired = !driveError && isExpired();
  const showNotice = !!driveError || expired;

  const driveConflictSummary = conflict && { modifiedTime: conflict.modifiedTime, ...summarize(conflict.parsed.backup.decks ?? []) };

  return (
    <div className={`gdrive gdrive--${variant}`}>
      {showNotice && (
        <div className="gdrive-notice">
          <span className={`gdrive-notice-icon${driveError?.kind === "offline" ? " is-offline" : ""}`} aria-hidden="true">
            {driveError?.kind === "offline" ? "⚠" : "⟳"}
          </span>
          <div>
            <strong>{driveError ? driveNoticeTitle(driveError.kind) : "Drive session expired"}</strong>
            <p>{driveError?.message ?? "Reconnect to keep saving — takes a second."}</p>
          </div>
        </div>
      )}

      {showNotice ? (
        <button type="button" className="btn btn-secondary btn-sm gdrive-btn-block" onClick={errorAction().onClick}>
          {driveError?.kind !== "quota" && driveIcon}
          {errorAction().label}
        </button>
      ) : status === "connecting" ? (
        <button type="button" className="btn btn-secondary btn-sm gdrive-btn-block" disabled>
          <span className="gdrive-spin" /> Connecting…
        </button>
      ) : !connected ? (
        <button type="button" className="btn btn-secondary btn-sm gdrive-btn-block" onClick={handleConnect}>
          {driveIcon} Connect Google Drive
        </button>
      ) : (
        <div className="gdrive-card">
          <div className="gdrive-id">
            <span className="gdrive-avatar">{connectedEmail ? initialOf(connectedEmail) : "?"}</span>
            <span className="gdrive-who">
              <span className="gdrive-who-label">Google Drive</span>
              <span className="gdrive-who-email" title={connectedEmail ?? undefined}>{connectedEmail}</span>
            </span>
            <button
              type="button"
              className="gdrive-disconnect"
              title="Disconnect"
              aria-label="Disconnect Google Drive"
              onClick={handleDisconnect}
            >×</button>
          </div>
          <div className="gdrive-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={status !== "idle"}>
              {status === "saving" ? <span className="gdrive-spin gdrive-spin--light" /> : "↓"} {status === "saving" ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleLoad} disabled={status !== "idle"}>
              {status === "loading" ? <span className="gdrive-spin" /> : "↑"} {status === "loading" ? "Loading…" : "Load"}
            </button>
          </div>
          {lastSync && (
            <div className="gdrive-meta">
              <span className="gdrive-dot" />
              {lastSync.verb} to Drive · {relativeTime(lastSync.at)}
            </div>
          )}
        </div>
      )}

      {conflict && driveConflictSummary && (
        <DriveConflictModal
          drive={driveConflictSummary}
          local={conflict.local}
          onKeepDrive={resolveKeepDrive}
          onKeepLocal={resolveKeepLocal}
        />
      )}
    </div>
  );
}

function driveNoticeTitle(kind: DriveError["kind"]): string {
  switch (kind) {
    case "expired": return "Drive session expired";
    case "offline": return "You're offline";
    case "quota": return "Google Drive is out of space";
    default: return "Drive request failed";
  }
}
