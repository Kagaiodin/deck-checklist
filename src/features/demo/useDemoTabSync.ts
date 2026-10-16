import { useEffect } from "react";
import { DEMO_ACTIVE_KEY } from "./demoMode";

const reloadPage = () => window.location.reload();

/** Another tab entered or left demo mode: reload so this tab re-reads storage. */
export function useDemoTabSync(reload: () => void = reloadPage): void {
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === DEMO_ACTIVE_KEY) reload();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [reload]);
}
