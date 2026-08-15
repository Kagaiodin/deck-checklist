// Thin wrapper around the File System Access API, used by ProfileExportImport
// to link a single local backup file for silent save/load after the first pick.
// Unsupported browsers (Safari, Firefox, mobile) fall back to download/upload
// in the caller — this module simply reports itself unavailable there.

let linkedHandle: FileSystemFileHandle | null = null;

export function supportsFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

export function getLinkedFileName(): string | null {
  return linkedHandle?.name ?? null;
}

export function clearLinkedHandle(): void {
  linkedHandle = null;
}

async function ensurePermission(handle: FileSystemFileHandle, mode: "read" | "readwrite"): Promise<boolean> {
  const opts = { mode };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  return (await handle.requestPermission(opts)) === "granted";
}

export async function pickSaveHandle(suggestedName: string): Promise<FileSystemFileHandle> {
  const handle = await window.showSaveFilePicker({
    suggestedName,
    types: [{ description: "Fetchlist backup", accept: { "application/json": [".json"] } }],
  });
  linkedHandle = handle;
  return handle;
}

export async function pickOpenHandle(): Promise<FileSystemFileHandle> {
  const [handle] = await window.showOpenFilePicker({
    types: [{ description: "Fetchlist backup", accept: { "application/json": [".json"] } }],
  });
  linkedHandle = handle;
  return handle;
}

export async function writeLinkedFile(contents: string): Promise<void> {
  if (!linkedHandle) throw new Error("No linked file handle");
  if (!(await ensurePermission(linkedHandle, "readwrite"))) throw new Error("Permission denied");
  const writable = await linkedHandle.createWritable();
  await writable.write(contents);
  await writable.close();
}

export async function readLinkedFile(): Promise<string> {
  if (!linkedHandle) throw new Error("No linked file handle");
  if (!(await ensurePermission(linkedHandle, "read"))) throw new Error("Permission denied");
  const file = await linkedHandle.getFile();
  return file.text();
}
