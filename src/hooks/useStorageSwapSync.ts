import { useEffect } from "react";
import { DEMO_ACTIVE_KEY, DEMO_VERSION_KEY } from "../features/demo/demoMode";
import { BACKUP_IMPORTED_KEY } from "../features/backup/backup";
import { page } from "../utils/page";

/**
 * Keys another tab writes when it swaps out the saved data wholesale: entering or leaving demo mode,
 * refreshing the sample data, importing a Backup. This tab's in-memory copies are then stale and
 * would save over the new data, so it reloads.
 */
const SWAP_KEYS = new Set([DEMO_ACTIVE_KEY, DEMO_VERSION_KEY, BACKUP_IMPORTED_KEY]);

/** Another tab swapped the saved data: reload so this tab re-reads storage. */
export function useStorageSwapSync(reload: () => void = page.reload): void {
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== null && SWAP_KEYS.has(e.key)) reload();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [reload]);
}
