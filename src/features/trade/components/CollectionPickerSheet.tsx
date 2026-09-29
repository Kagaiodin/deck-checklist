import { useMemo, useState } from "react";
import type { Collection, Deck } from "../../../types/index";
import type { Finish, TradeCard } from "../../../types/trade";
import { basePriceFor } from "../../../utils/tradePricing";
import { fetchPrices, priceKey, searchPrintings, type Printing } from "../../../utils/scryfallSearch";
import { collectionEntries } from "../collectionMatch";
import { FINISH_LABEL, displayName } from "../format";
import { PlusIcon } from "./TradeIcons";
import { TradeSheet } from "./TradeSheet";

const MAX_ROWS = 100;

interface CollectionPickerSheetProps {
  collection: Collection;
  decks: Deck[];
  onAdd: (cards: Omit<TradeCard, "id">[]) => void;
  onClose: () => void;
}

export function CollectionPickerSheet({ collection, decks, onAdd, onClose }: CollectionPickerSheetProps) {
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState(false);

  const all = useMemo(() => collectionEntries(collection, filter), [collection, filter]);
  const shown = all.slice(0, MAX_ROWS);

  // Deck cards carry no printing info, so "in decks" is by name (same basis as the Collection tab).
  const inDecksByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of decks) for (const c of d.cards) if (c.acquired) m.set(c.name.toLowerCase(), (m.get(c.name.toLowerCase()) ?? 0) + c.quantity);
    return m;
  }, [decks]);

  const selectedCount = Object.values(selected).reduce((a, b) => a + b, 0);

  function step(id: string, owned: number, delta: number) {
    setSelected((s) => {
      const n = Math.max(0, Math.min(owned, (s[id] ?? 0) + delta));
      const next = { ...s };
      if (n === 0) delete next[id];
      else next[id] = n;
      return next;
    });
  }

  async function commit() {
    setAdding(true);
    const chosen = collectionEntries(collection).filter((e) => selected[e.id]);
    const known = chosen.filter((e) => e.printing.set && e.printing.collectorNumber);
    const prices = known.length
      ? await fetchPrices(known.map((e) => ({ set: e.printing.set!, collectorNumber: e.printing.collectorNumber! })))
      : new Map<string, Printing>();

    const cards = await Promise.all(
      chosen.map(async (e): Promise<Omit<TradeCard, "id">> => {
        const { printing } = e;
        const finish: Finish = printing.foil ? "foil" : "nonfoil";
        let found: Printing | undefined;
        if (printing.set && printing.collectorNumber) {
          found = prices.get(priceKey({ set: printing.set, collectorNumber: printing.collectorNumber }));
        } else {
          // Order receipts record quantity only: fall back to the newest printing of that name.
          found = await searchPrintings(e.name).then((r) => r[0], () => undefined);
        }
        return {
          name: found?.name ?? displayName(e.name),
          scryfallId: found?.scryfallId ?? "",
          set: found?.set ?? printing.set ?? "",
          collectorNumber: found?.collectorNumber ?? printing.collectorNumber ?? "",
          finish,
          condition: "NM",
          quantity: selected[e.id],
          imageUrl: found?.imageUrl,
          basePrice: found ? basePriceFor(found.prices, finish) : null,
          priceFetchedAt: found ? Date.now() : null,
          source: "collection",
        };
      })
    );
    onAdd(cards);
  }

  return (
    <TradeSheet
      title="Add from collection"
      chip="My offer only"
      onClose={onClose}
      footer={
        <>
          <span className="tr-note" role="status">{selectedCount ? `${selectedCount} card${selectedCount > 1 ? "s" : ""} selected` : "Nothing selected"}</span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={selectedCount === 0 || adding} onClick={() => void commit()}>
            {adding ? "Adding…" : "Add to My offer"}
          </button>
        </>
      }
    >
      <input className="tr-text-input" aria-label="Filter collection" placeholder="Filter your collection…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <p className="tr-note" style={{ margin: "8px 0 4px" }}>Picking doesn't change your collection. Cards committed to decks are flagged, not blocked.</p>

      {shown.length === 0 ? (
        <p className="tr-note" style={{ padding: "16px 0" }}>
          {Object.keys(collection).length === 0 ? "Your collection is empty. Upload a CSV on the Collection tab, or use Search cards." : `No cards match “${filter}”.`}
        </p>
      ) : (
        <ul style={{ listStyle: "none" }}>
          {shown.map((e) => {
            const n = selected[e.id] ?? 0;
            const { printing } = e;
            const inDecks = inDecksByName.get(e.name) ?? 0;
            const label = displayName(e.name);
            return (
              <li key={e.id} className="tr-coll-row">
                <span className="tr-thumb" aria-hidden="true" />
                <div style={{ minWidth: 0 }}>
                  <div className="tr-row-name">{label}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 3 }}>
                    {printing.set && <span className="tr-set-chip">{printing.set.toUpperCase()}{printing.collectorNumber ? ` · ${printing.collectorNumber}` : ""}</span>}
                    <span className="tr-note">{FINISH_LABEL[printing.foil ? "foil" : "nonfoil"]} · own <b className="tr-mono">{printing.quantity}</b></span>
                    {inDecks > 0 && <span className="tr-chip tr-chip--deck">{inDecks} in decks</span>}
                  </div>
                </div>
                {n > 0 ? (
                  <span className="tr-stepper" role="group" aria-label={`Quantity for ${label}`}>
                    <button type="button" aria-label={`Decrease ${label}`} onClick={() => step(e.id, printing.quantity, -1)}>−</button>
                    <input readOnly aria-label={`Selected ${label}`} value={n} />
                    <button type="button" aria-label={`Increase ${label}`} disabled={n >= printing.quantity} onClick={() => step(e.id, printing.quantity, 1)}>+</button>
                    <span className="tr-stepper-cap">/{printing.quantity}</span>
                  </span>
                ) : (
                  <button type="button" className="btn btn-secondary btn-sm" aria-label={`Add ${label}`} onClick={() => step(e.id, printing.quantity, 1)}><PlusIcon />Add</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {all.length > MAX_ROWS && <p className="tr-note" style={{ paddingTop: 8 }}>Showing {MAX_ROWS} of {all.length.toLocaleString()} — filter to narrow it down.</p>}
    </TradeSheet>
  );
}
