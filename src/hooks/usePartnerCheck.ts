import { useEffect, useState } from "react";
import type { Card } from "../types/index";
import { checkPartnerPair } from "../utils/partnerCheck";

/** True only when exactly two commanders are set and the pair is looked up as not legal. */
export function usePartnerCheck(commanders: Card[]): boolean {
  const [flagged, setFlagged] = useState<{ key: string; bad: boolean } | null>(null);
  const key = commanders.length === 2 ? commanders.map(c => c.name).sort().join("|") : "";

  useEffect(() => {
    if (!key) return;
    let stale = false;
    const [a, b] = key.split("|");
    void checkPartnerPair(a, b).then(legal => {
      if (!stale) setFlagged({ key, bad: legal === false });
    });
    return () => { stale = true; };
  }, [key]);

  return !!key && flagged?.key === key && flagged.bad;
}
