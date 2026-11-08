import { useEffect } from "react";
import { page } from "../utils/page";

/**
 * Reloads this tab when another tab writes one of `keys`. Used for the keys another tab writes when
 * it replaces the saved data wholesale (demo mode, a Backup import): this tab's in-memory copies are
 * then stale and would save over the new data. `keys` should be a stable (module-level) list.
 */
export function useReloadOnOtherTabWrite(keys: readonly string[], reload: () => void = page.reload): void {
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== null && keys.includes(e.key)) reload();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [keys, reload]);
}
