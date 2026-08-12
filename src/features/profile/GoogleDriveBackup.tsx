import { useEffect, useState } from "react";
import type { Deck, ErrorQueueItem, Collection, CollectionMeta, Order, ProfileExport } from "../../types/index";
import {
  supportsGoogleDrive, getConnectedEmail, isConnected, isExpired,
  connect, disconnect, saveToDrive, loadFromDrive, DriveError,
} from "../../utils/googleDrive";
import { DriveConflictModal } from "./DriveConflictModal";
import type { ToastInput } from "./ProfileExportImport";
import "./GoogleDriveBackup.css";

interface Props {
  decks: Deck[];
  allErrors: Record<string, ErrorQueueItem[]>;
  collection: Collection;
  collectionMeta: CollectionMeta | null;
  orders: Order[];
  vendorHistory: string[];
  onImport: (data: ProfileExport, replace: boolean) => { newDecks: number; newCards: number; newOrders: number };
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

function countCards(decks: Deck[]): number {
  return decks.reduce((sum, d) => sum + d.cards.length, 0);
}

function relativeTime(from: Date): string {
  const seconds = Math.round((Date.now() - from.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export function GoogleDriveBackup({
  decks, allErrors, collection, collectionMeta, orders, vendorHistory,
  onImport, showToast, variant,
}: Props) {
  const [status, setStatus] = useState<"idle" | "connecting" | "saving" | "loading">("idle");
  const [connectedEmail, setConnectedEmail] = useState<string | null>(getConnectedEmail());
  const [driveError, setDriveError] = useState<{ kind: DriveError["kind"]; message: string } | null>(null);
  const [lastSync, setLastSync] = useState<{ verb: "Saved" | "Loaded"; at: Date } | null>(null);
  const [conflict, setConflict] = useState<{ contents: string; modifiedTime: string } | null>(null);
  const [, forceTick] = useState(0);

  // Keep the "· 2m ago" meta line fresh without a full data refetch.
  useEffect(() => {
    if (!lastSync) return;
    const id = setInterval(() => forceTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, [lastSync]);

  if (!supportsGoogleDrive()) return null;

  function buildPayload(): ProfileExport {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      decks, errors: allErrors, collection, collectionMeta, orders, vendorHistory,
    };
  }

  function applyDriveContents(text: string): boolean {
    let parsed: ProfileExport;
    try {
      parsed = JSON.parse(text);
    } catch {
      setDriveError({ kind: "unknown", message: "The Drive backup couldn't be read." });
      return false;
    }
    onImport(parsed, true);
    return true;
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
      await saveToDrive(JSON.stringify(buildPayload()));
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
      const hasLocalData = decks.length > 0 || Object.keys(collection).length > 0 || orders.length > 0;
      if (hasLocalData) {
        setConflict(result);
      } else if (applyDriveContents(result.contents)) {
        setLastSync({ verb: "Loaded", at: new Date() });
        showToast({ title: "Loaded from Drive", variant: "success", autoDismiss: 2000 });
      }
    } catch (err) {
      setDriveError(err as DriveError);
    } finally {
      setStatus("idle");
    }
  }

  function resolveKeepDrive() {
    if (!conflict) return;
    if (applyDriveContents(conflict.contents)) {
      setLastSync({ verb: "Loaded", at: new Date() });
      showToast({ title: "Loaded Drive version", variant: "success", autoDismiss: 2000 });
    }
    setConflict(null);
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

  let driveConflictSummary = null;
  if (conflict) {
    let driveCounts = { deckCount: 0, cardCount: 0 };
    try {
      const parsed = JSON.parse(conflict.contents) as ProfileExport;
      driveCounts = { deckCount: (parsed.decks ?? []).length, cardCount: countCards(parsed.decks ?? []) };
    } catch { /* malformed backup — counts stay at 0, modal still lets the user choose */ }
    driveConflictSummary = { modifiedTime: conflict.modifiedTime, ...driveCounts };
  }

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
          local={{ deckCount: decks.length, cardCount: countCards(decks) }}
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
