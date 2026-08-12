// Client-side Google Drive integration (Tier 2, issue #52) — no backend.
//
// Auth uses Google Identity Services' token client: a popup-based OAuth flow
// that returns a short-lived access token (~1hr) and never a refresh token.
// That's deliberate, not a gap — see docs/specs/google-drive-integration-design-brief.md
// under "Cost constraint": we're not running a server to store refresh tokens,
// so expiry is designed to read as a routine "reconnect", not an error.
//
// All Drive access goes through plain fetch against the REST API (no
// googleapis npm package) and is scoped to drive.appdata — a hidden,
// app-private folder the user can't browse — holding one file,
// fetchlist-backup.json.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPES = "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email";
const BACKUP_FILENAME = "fetchlist-backup.json";
const GIS_SRC = "https://accounts.google.com/gsi/client";

let accessToken: string | null = null;
let tokenExpiresAt = 0;
let connectedEmail: string | null = null;
let cachedFileId: string | null = null;
let gisLoadPromise: Promise<void> | null = null;

export type DriveErrorKind = "expired" | "offline" | "quota" | "unknown";

export class DriveError extends Error {
  kind: DriveErrorKind;
  constructor(kind: DriveErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export function supportsGoogleDrive(): boolean {
  return typeof window !== "undefined" && !!CLIENT_ID;
}

export function getConnectedEmail(): string | null {
  return connectedEmail;
}

export function isConnected(): boolean {
  return !!accessToken && Date.now() < tokenExpiresAt;
}

export function isExpired(): boolean {
  return !!connectedEmail && !isConnected();
}

export function disconnect(): void {
  if (accessToken) window.google?.accounts.oauth2.revoke(accessToken);
  accessToken = null;
  tokenExpiresAt = 0;
  connectedEmail = null;
  cachedFileId = null;
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new DriveError("offline", "Couldn't reach Google — check your connection."));
    document.head.appendChild(script);
  });
  return gisLoadPromise;
}

async function fetchProfile(): Promise<{ email: string }> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new DriveError("unknown", "Couldn't read the connected Google account.");
  const data = await res.json() as { email: string };
  return { email: data.email };
}

export async function connect(): Promise<{ email: string }> {
  if (!CLIENT_ID) throw new DriveError("unknown", "Google Drive isn't configured for this deployment.");
  await loadGis();

  const token = await new Promise<GoogleTokenResponse>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: resp => resp.error ? reject(new DriveError("unknown", resp.error_description ?? resp.error!)) : resolve(resp),
      error_callback: err => reject(new DriveError(err.type === "popup_closed" ? "unknown" : "unknown", err.message ?? "Connection was cancelled.")),
    });
    client.requestAccessToken({ prompt: "" });
  });

  accessToken = token.access_token;
  tokenExpiresAt = Date.now() + token.expires_in * 1000;
  cachedFileId = null;

  const profile = await fetchProfile();
  connectedEmail = profile.email;
  return profile;
}

function classifyFetchError(err: unknown): DriveError {
  if (err instanceof DriveError) return err;
  if (err instanceof TypeError) return new DriveError("offline", "You're offline. Drive save paused — it'll resume when you're back.");
  return new DriveError("unknown", "Something went wrong talking to Google Drive.");
}

async function classifyResponse(res: Response): Promise<DriveError> {
  if (res.status === 401) return new DriveError("expired", "Drive session expired. Reconnect to keep saving.");
  if (res.status === 403 || res.status === 429) {
    const body = await res.json().catch(() => null) as { error?: { errors?: { reason?: string }[] } } | null;
    const reason = body?.error?.errors?.[0]?.reason ?? "";
    if (reason.includes("quota") || reason.includes("storage")) {
      return new DriveError("quota", "Google Drive is out of space. Free up room, then save again.");
    }
    return new DriveError("unknown", "Google Drive declined the request.");
  }
  return new DriveError("unknown", "Something went wrong talking to Google Drive.");
}

function requireToken(): void {
  if (!isConnected()) throw new DriveError("expired", "Drive session expired. Reconnect to keep saving.");
}

async function findBackupFile(): Promise<{ id: string; modifiedTime: string } | null> {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    q: `name='${BACKUP_FILENAME}' and trashed=false`,
    fields: "files(id,modifiedTime)",
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw await classifyResponse(res);
  const data = await res.json() as { files: { id: string; modifiedTime: string }[] };
  const file = data.files[0] ?? null;
  if (file) cachedFileId = file.id;
  return file;
}

export async function saveToDrive(contents: string): Promise<void> {
  requireToken();
  try {
    const existing = cachedFileId ? { id: cachedFileId } : await findBackupFile();

    if (existing) {
      const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: contents,
      });
      if (!res.ok) throw await classifyResponse(res);
      return;
    }

    const boundary = "fetchlist-boundary";
    const metadata = { name: BACKUP_FILENAME, parents: ["appDataFolder"] };
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${contents}\r\n` +
      `--${boundary}--`;

    const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!res.ok) throw await classifyResponse(res);
    const created = await res.json() as { id: string };
    cachedFileId = created.id;
  } catch (err) {
    throw classifyFetchError(err);
  }
}

export async function loadFromDrive(): Promise<{ contents: string; modifiedTime: string } | null> {
  requireToken();
  try {
    const file = await findBackupFile();
    if (!file) return null;

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw await classifyResponse(res);
    const contents = await res.text();
    return { contents, modifiedTime: file.modifiedTime };
  } catch (err) {
    throw classifyFetchError(err);
  }
}
