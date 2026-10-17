import { enterDemo, exitDemo, hasRealData, isDemoActive, type DemoSource } from "./demoMode";

export const RECOVERED_FLAG = "fetchlist:demo:recovered";

export interface DemoDeps {
  storage: Storage;
  session: Storage;
  reload: () => void;
  now: () => number;
}

const defaultDeps = (): DemoDeps => ({
  storage: window.localStorage,
  session: window.sessionStorage,
  reload: () => window.location.reload(),
  now: () => Date.now(),
});

/** Loads the fixture lazily, swaps it in, and reloads so the app re-reads storage. */
export async function startDemo(source: DemoSource, deps: DemoDeps = defaultDeps(), { reload = true } = {}): Promise<boolean> {
  const { buildDemoData } = await import("./demoData");
  const { ok } = enterDemo(deps.storage, buildDemoData(deps.now()), source);
  if (ok && reload) deps.reload();
  return ok;
}

export function leaveDemo(deps: DemoDeps = defaultDeps()): void {
  const { recovered } = exitDemo(deps.storage);
  try {
    if (recovered) deps.session.setItem(RECOVERED_FLAG, "1");
  } catch {
    // no sessionStorage: the toast is a nicety, the exit still worked
  }
  deps.reload();
}

/** True once per page load when the previous exit had to fall back to clearing data. */
export function consumeRecoveredFlag(session: Storage = window.sessionStorage): boolean {
  try {
    const was = session.getItem(RECOVERED_FLAG) === "1";
    session.removeItem(RECOVERED_FLAG);
    return was;
  } catch {
    return false;
  }
}

let pendingLinkConfirm = false;

/** True after a `?demo=true` arrival that still needs the user's confirmation. */
export const hasPendingLinkConfirm = (): boolean => pendingLinkConfirm;
export const clearPendingLinkConfirm = (): void => { pendingLinkConfirm = false; };

function stripDemoParam(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("demo");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}

/**
 * Handles `?demo=true` before the app renders. A fresh user is moved into demo
 * mode directly (no reload needed, nothing has read storage yet). Someone with
 * real data gets "needs-confirm" so the UI can ask first.
 */
export async function bootDemoFromUrl(deps: DemoDeps = defaultDeps()): Promise<"none" | "entered" | "needs-confirm"> {
  if (new URL(window.location.href).searchParams.get("demo") !== "true") return "none";
  stripDemoParam();
  if (isDemoActive(deps.storage)) return "none";
  if (hasRealData(deps.storage)) {
    pendingLinkConfirm = true;
    return "needs-confirm";
  }
  return (await startDemo("link", deps, { reload: false })) ? "entered" : "none";
}
