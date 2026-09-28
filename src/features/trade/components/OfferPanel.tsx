import { useRef, useState } from "react";
import { CONDITIONS, type Condition, type Finish, type TradeCard, type TradeSettings, type TradeSide } from "../../../types/trade";
import type { SideTotals } from "../../../utils/tradePricing";
import type { SideKey } from "../hooks/useTrade";
import { EmptyState } from "../../../components/EmptyState";
import { usd } from "../format";
import { Popover } from "./Popover";
import { DiscountForm, TradeCardRow, type OwnedInfo } from "./TradeCardRow";
import { AlertIcon, CashIcon, MoreIcon, PercentIcon, SearchIcon, StackIcon, XIcon } from "./TradeIcons";

interface OfferPanelProps {
  side: SideKey;
  data: TradeSide;
  totals: SideTotals;
  settings: TradeSettings;
  readOnly: boolean;
  /** Mobile puts the add actions in a bottom bar instead. */
  hideAdds?: boolean;
  staleIds: Set<string>;
  flashId: string | null;
  getOwned: (card: TradeCard) => OwnedInfo | null;
  onAddFromCollection?: () => void;
  onAddSearch: () => void;
  onUpdateCard: (id: string, patch: Partial<Omit<TradeCard, "id">>) => void;
  onRemoveCard: (id: string) => void;
  onChangeFinish: (card: TradeCard, finish: Finish) => void;
  onSetSideDiscount: (pct: number | undefined) => void;
  onSetSideCondition: (condition: Condition) => void;
  onUpdateCash: (id: string, amount: number) => void;
  onRemoveCash: (id: string) => void;
}

type HeaderPop = "discount" | "menu" | null;

export function OfferPanel(p: OfferPanelProps) {
  const isMine = p.side === "mine";
  const title = isMine ? "My offer" : "Their offer";
  const [pop, setPop] = useState<HeaderPop>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const close = () => setPop(null);

  const cardCount = p.data.cards.reduce((n, c) => n + c.quantity, 0);
  const sideDiscount = p.data.discountOverridePct;
  const shownDiscount = sideDiscount ?? p.settings.discountPct;

  return (
    <section className={`tr-offer tr-offer--${p.side}`} aria-label={title} data-side={p.side}>
      <div className="tr-offer-head">
        <h2>{title}</h2>
        <span className="tr-offer-count tr-mono">{cardCount} card{cardCount === 1 ? "" : "s"}</span>
        <span className="tr-spacer" />
        {p.readOnly ? (
          <span className="tr-chip">−{shownDiscount}%</span>
        ) : (
          <>
            <button
              type="button"
              className={`tr-chip${sideDiscount !== undefined ? " tr-chip--override" : ""}`}
              aria-haspopup="dialog"
              aria-expanded={pop === "discount"}
              title="Set a discount for this side only"
              onClick={(e) => { setAnchor(e.currentTarget); setPop(pop === "discount" ? null : "discount"); }}
            >
              {sideDiscount !== undefined && <PercentIcon />}−{shownDiscount}%{sideDiscount !== undefined && " this side"}
            </button>
            <button
              ref={menuRef}
              type="button"
              className="tr-icon-btn"
              aria-label={`${title} options`}
              aria-haspopup="dialog"
              aria-expanded={pop === "menu"}
              onClick={(e) => { setAnchor(e.currentTarget); setPop(pop === "menu" ? null : "menu"); }}
            >
              <MoreIcon />
            </button>
          </>
        )}
      </div>

      {!p.readOnly && !p.hideAdds && (
        <div className="tr-offer-adds">
          {isMine && p.onAddFromCollection && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={p.onAddFromCollection}><StackIcon />From collection</button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={p.onAddSearch}><SearchIcon />Search cards</button>
        </div>
      )}

      {p.data.cards.length > 0 ? (
        <ul className="tr-offer-list">
          {p.data.cards.map((card) => (
            <TradeCardRow
              key={card.id}
              card={card}
              side={p.data}
              settings={p.settings}
              readOnly={p.readOnly}
              stale={p.staleIds.has(card.id)}
              flash={p.flashId === card.id}
              ownedInfo={p.readOnly ? null : p.getOwned(card)}
              onUpdate={(patch) => p.onUpdateCard(card.id, patch)}
              onRemove={() => p.onRemoveCard(card.id)}
              onChangeFinish={(f) => p.onChangeFinish(card, f)}
            />
          ))}
        </ul>
      ) : p.data.cash.length === 0 ? (
        <div className="tr-offer-empty">
          <EmptyState
            icon={isMine ? <StackIcon size={26} /> : <SearchIcon size={26} />}
            title={isMine ? "Nothing offered yet" : "Nothing requested yet"}
            body={p.readOnly ? "No cards on this side." : isMine ? "Pull cards from your collection or search any printing." : "Search Scryfall for the cards they're putting up."}
          />
        </div>
      ) : null}

      {p.data.cash.map((line) => (
        <CashRow key={line.id} amount={line.amount} readOnly={p.readOnly} onCommit={(n) => p.onUpdateCash(line.id, n)} onRemove={() => p.onRemoveCash(line.id)} />
      ))}

      <div className="tr-offer-foot">
        {p.totals.missingPriceCount > 0 && (
          <div className="tr-foot-line">
            <span className="tr-foot-warn"><AlertIcon size={14} />{p.totals.missingPriceCount} without price</span>
            <span>counted as $0</span>
          </div>
        )}
        <div className="tr-foot-line tr-foot-line--total">
          <span>Subtotal</span>
          <span className="tr-mono" data-testid={`subtotal-${p.side}`}>{usd(p.totals.total)}</span>
        </div>
      </div>

      {pop === "discount" && (
        <Popover anchor={anchor} label={`${title} discount`} onClose={close}>
          <DiscountForm
            title={`Discount — ${title}`}
            subtitle={`Overrides the global ${p.settings.discountPct}% for every card on this side. Card overrides still win.`}
            inherited={p.settings.discountPct}
            inheritedLabel="global"
            current={sideDiscount}
            onApply={(pct) => { close(); p.onSetSideDiscount(pct); }}
            onClear={() => { close(); p.onSetSideDiscount(undefined); }}
          />
        </Popover>
      )}

      {pop === "menu" && (
        <Popover anchor={anchor} label={`${title} options`} onClose={close}>
          <div className="tr-pop-head">
            <div className="t">Set condition for all cards</div>
            <div className="s">{p.data.cards.length === 0 ? "Add cards first" : `Applies to ${p.data.cards.length} line${p.data.cards.length === 1 ? "" : "s"} on this side`}</div>
          </div>
          <div className="tr-pop-form">
            <div className="tr-seg" role="group" aria-label="Condition for all cards">
              {CONDITIONS.map((c) => (
                <button key={c} type="button" disabled={p.data.cards.length === 0} onClick={() => { close(); p.onSetSideCondition(c); }}>{c}</button>
              ))}
            </div>
          </div>
        </Popover>
      )}
    </section>
  );
}

function CashRow({ amount, readOnly, onCommit, onRemove }: { amount: number; readOnly: boolean; onCommit: (n: number) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const n = parseFloat(draft ?? "");
    setDraft(null);
    if (Number.isFinite(n) && n !== amount) onCommit(Math.max(0, n));
  };
  return (
    <div className="tr-cash-line">
      <span className="tr-cash-ico"><CashIcon size={14} /></span>
      <span className="tr-spacer">Cash / credit</span>
      {readOnly ? (
        <span className="tr-mono">{usd(amount)}</span>
      ) : (
        <>
          <span className="tr-pct-field">
            <span className="pre">$</span>
            <input
              inputMode="decimal"
              aria-label="Cash amount"
              style={{ width: 64 }}
              value={draft ?? amount.toFixed(2)}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={(e) => e.target.select()}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            />
          </span>
          <button type="button" className="tr-icon-btn" aria-label="Remove cash line" onClick={onRemove}><XIcon /></button>
        </>
      )}
    </div>
  );
}
