import { useRef, useState } from "react";
import { CONDITIONS, CONDITION_MULTIPLIERS, type Condition, type Finish, type TradeCard, type TradeSettings, type TradeSide } from "../../../types/trade";
import { effectiveBase, resolveDiscount, unitPrice } from "../../../utils/tradePricing";
import { FINISH_LABEL, clampPct, relativeAge, usd } from "../format";
import { Popover } from "./Popover";
import { AlertIcon, ClockIcon, InfoIcon, MoreIcon, PencilIcon, PercentIcon, TrashIcon } from "./TradeIcons";

export interface OwnedInfo {
  owned: number;
  inDecks: number;
}

interface TradeCardRowProps {
  card: TradeCard;
  side: Pick<TradeSide, "discountOverridePct">;
  settings: TradeSettings;
  readOnly: boolean;
  stale: boolean;
  flash?: boolean;
  /** Derived from Collection + decks at render time; null when there's no collection match. */
  ownedInfo: OwnedInfo | null;
  onUpdate: (patch: Partial<Omit<TradeCard, "id">>) => void;
  onRemove: () => void;
  onChangeFinish: (finish: Finish) => void;
}

type Pop = "menu" | "breakdown" | "discount" | "manual";

const discountSource = (card: TradeCard, side: Pick<TradeSide, "discountOverridePct">) =>
  card.discountOverridePct !== undefined ? "card" : side.discountOverridePct !== undefined ? "side" : "global";

export function TradeCardRow({ card, side, settings, readOnly, stale, flash, ownedInfo, onUpdate, onRemove, onChangeFinish }: TradeCardRowProps) {
  const [pop, setPop] = useState<Pop | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  const unit = unitPrice(card, side, settings);
  const noPrice = unit === null;
  const manual = card.manualPrice !== undefined;
  const cap = card.source === "collection" && ownedInfo && ownedInfo.owned > 0 ? ownedInfo.owned : undefined;

  const open = (p: Pop, el: HTMLElement | null) => { setAnchor(el); setPop(p); };
  const close = () => setPop(null);
  // Forms opened from the ⋯ menu re-anchor on the ⋯ button itself.
  const openFromMenu = (p: Pop) => open(p, moreRef.current);

  const setQty = (n: number) => onUpdate({ quantity: cap ? Math.min(cap, Math.max(1, n)) : Math.max(1, n) });

  const cls = ["tr-row", noPrice && "tr-row--noprice", stale && "tr-row--stale", manual && "tr-row--manual", readOnly && "tr-row--readonly", flash && "tr-row--flash"]
    .filter(Boolean).join(" ");

  const badges = (
    <>
      {card.discountOverridePct !== undefined && (
        readOnly
          ? <span className="tr-chip tr-chip--override"><PercentIcon />−{card.discountOverridePct}% card</span>
          : <button type="button" className="tr-chip tr-chip--override" title="Per-card discount override" onClick={(e) => open("discount", e.currentTarget)}><PercentIcon />−{card.discountOverridePct}% card</button>
      )}
      {manual && (
        readOnly
          ? <span className="tr-chip"><PencilIcon />Manual</span>
          : <button type="button" className="tr-chip" title="Manual price — condition not applied" onClick={(e) => open("manual", e.currentTarget)}><PencilIcon />Manual</button>
      )}
      {noPrice && <span className="tr-chip tr-chip--warn"><AlertIcon />No price</span>}
      {stale && <span className="tr-chip tr-chip--warn" title="Refresh failed — showing last price"><ClockIcon />Stale</span>}
    </>
  );
  const hasBadges = card.discountOverridePct !== undefined || manual || noPrice || stale;

  return (
    <li className={cls} data-card-id={card.id} data-no-price={noPrice ? "true" : undefined}>
      {card.imageUrl ? <img className="tr-thumb" src={card.imageUrl} alt="" loading="lazy" /> : <span className="tr-thumb" aria-hidden="true" />}

      <div className="tr-row-main">
        <div className="tr-row-l1">
          <span className="tr-row-name" title={card.name}>{card.name}</span>
          <span className="tr-set-chip">{card.set.toUpperCase()} · {card.collectorNumber}</span>
          {ownedInfo && ownedInfo.inDecks > 0 && (
            <span className="tr-chip tr-chip--deck" title={`Committed to ${ownedInfo.inDecks} deck slot${ownedInfo.inDecks === 1 ? "" : "s"} — not blocked`}>
              {ownedInfo.inDecks} in decks
            </span>
          )}
        </div>

        <div className="tr-row-l2">
          {readOnly ? (
            <>
              <span className="tr-ro-meta">{FINISH_LABEL[card.finish]}</span>
              <span className="tr-ro-meta">{card.condition}</span>
              <span className="tr-ro-meta tr-mono">×{card.quantity}</span>
            </>
          ) : (
            <>
              <select className="tr-select" aria-label={`Finish for ${card.name}`} value={card.finish} onChange={(e) => onChangeFinish(e.target.value as Finish)}>
                {(Object.keys(FINISH_LABEL) as Finish[]).map((f) => <option key={f} value={f}>{FINISH_LABEL[f]}</option>)}
              </select>
              <select
                className="tr-select"
                data-field="condition"
                aria-label={`Condition for ${card.name}`}
                title={manual ? "Not applied — a manual price is final before discount" : undefined}
                value={card.condition}
                onChange={(e) => onUpdate({ condition: e.target.value as Condition })}
              >
                {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <span className="tr-stepper" role="group" aria-label={`Quantity for ${card.name}`}>
                <button type="button" aria-label={`Decrease quantity of ${card.name}`} disabled={card.quantity <= 1} onClick={() => setQty(card.quantity - 1)}>−</button>
                <QtyInput value={card.quantity} label={`Quantity of ${card.name}`} onCommit={setQty} />
                <button type="button" aria-label={`Increase quantity of ${card.name}`} disabled={cap !== undefined && card.quantity >= cap} onClick={() => setQty(card.quantity + 1)}>+</button>
                {cap !== undefined && <span className="tr-stepper-cap">/{cap}</span>}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="tr-row-end">
        <div className="tr-row-end-top">
          <span className="tr-line-total">{noPrice ? "—" : usd(unit * card.quantity)}</span>
          {!readOnly && (
            <button
              ref={moreRef}
              type="button"
              className="tr-icon-btn tr-row-more"
              aria-label={`More actions for ${card.name}`}
              aria-haspopup="menu"
              aria-expanded={pop === "menu"}
              onClick={(e) => (pop === "menu" ? close() : open("menu", e.currentTarget))}
            >
              <MoreIcon />
            </button>
          )}
        </div>
        {noPrice
          ? !readOnly && <button type="button" className="tr-unit-btn" onClick={(e) => open("manual", e.currentTarget)}>Set price</button>
          : <button type="button" className="tr-unit-btn" aria-label={`Price breakdown for ${card.name}`} onClick={(e) => open("breakdown", e.currentTarget)}>{usd(unit)} ea</button>}
        {hasBadges && <div className="tr-row-badges">{badges}</div>}
      </div>

      {pop === "menu" && (
        <Popover anchor={anchor} label="Card actions" role="menu" onClose={close}>
          <button type="button" role="menuitem" className="tr-menu-item" onClick={() => openFromMenu("breakdown")}><InfoIcon />Price breakdown</button>
          <button type="button" role="menuitem" className="tr-menu-item" onClick={() => openFromMenu("discount")}>
            <PercentIcon />{card.discountOverridePct !== undefined ? "Edit" : "Override"} discount
            {card.discountOverridePct !== undefined && <span className="hint">−{card.discountOverridePct}%</span>}
          </button>
          <button type="button" role="menuitem" className="tr-menu-item" onClick={() => openFromMenu("manual")}><PencilIcon />{manual ? "Edit" : "Set"} manual price</button>
          <div className="tr-menu-sep" />
          <button type="button" role="menuitem" className="tr-menu-item tr-menu-item--danger" onClick={() => { close(); onRemove(); }}><TrashIcon />Remove</button>
        </Popover>
      )}

      {pop === "breakdown" && (
        <Popover anchor={anchor} label="Price breakdown" onClose={close}>
          <Breakdown card={card} side={side} settings={settings} stale={stale} />
        </Popover>
      )}

      {pop === "discount" && (
        <Popover anchor={anchor} label="Card discount" onClose={close}>
          <DiscountForm
            title="Discount for this card"
            inherited={side.discountOverridePct ?? settings.discountPct}
            inheritedLabel={side.discountOverridePct !== undefined ? "side" : "global"}
            current={card.discountOverridePct}
            onApply={(pct) => { close(); onUpdate({ discountOverridePct: pct }); }}
            onClear={() => { close(); onUpdate({ discountOverridePct: undefined }); }}
          />
        </Popover>
      )}

      {pop === "manual" && (
        <Popover anchor={anchor} label="Manual price" onClose={close}>
          <ManualForm
            current={card.manualPrice}
            discount={resolveDiscount(card, side, settings)}
            onApply={(amount) => { close(); onUpdate({ manualPrice: amount }); }}
            onClear={() => { close(); onUpdate({ manualPrice: undefined }); }}
          />
        </Popover>
      )}
    </li>
  );
}

/** Text input that commits on blur/Enter, so typing "12" is one edit, not two. */
function QtyInput({ value, label, onCommit }: { value: number; label: string; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const n = parseInt(draft ?? "", 10);
    setDraft(null);
    if (Number.isFinite(n) && n !== value) onCommit(n);
  };
  return (
    <input
      inputMode="numeric"
      aria-label={label}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}

function Breakdown({ card, side, settings, stale }: { card: TradeCard; side: Pick<TradeSide, "discountOverridePct">; settings: TradeSettings; stale: boolean }) {
  const unit = unitPrice(card, side, settings);
  const discount = resolveDiscount(card, side, settings);
  const age = card.priceFetchedAt === null ? "no price snapshot" : stale ? "refresh failed, last price" : `updated ${relativeAge(card.priceFetchedAt)}`;
  return (
    <>
      <div className="tr-pop-head">
        <div className="t">{card.name}</div>
        <div className="s">{card.set.toUpperCase()} · {card.collectorNumber} · {age}</div>
      </div>
      <dl className="tr-bd">
        {card.manualPrice !== undefined ? (
          <>
            <dt>Manual price</dt><dd>{usd(card.manualPrice)}</dd>
            <dt>Condition</dt><dd>not applied</dd>
          </>
        ) : (
          <>
            <dt>TCGplayer · {card.finish}</dt><dd>{usd(card.basePrice)}</dd>
            <dt>Condition {card.condition}</dt><dd>×{CONDITION_MULTIPLIERS[card.condition].toFixed(2)}</dd>
            {effectiveBase(card) !== null && <><dt>Adjusted</dt><dd>{usd(effectiveBase(card))}</dd></>}
          </>
        )}
        <dt>Discount ({discountSource(card, side)})</dt><dd>−{discount}%</dd>
        <dt className="sum">Unit price</dt><dd className="sum">{usd(unit)}</dd>
        {card.quantity > 1 && unit !== null && <><dt>× {card.quantity}</dt><dd>{usd(unit * card.quantity)}</dd></>}
      </dl>
    </>
  );
}

interface DiscountFormProps {
  title: string;
  subtitle?: string;
  inherited: number;
  inheritedLabel: string;
  current: number | undefined;
  onApply: (pct: number) => void;
  onClear: () => void;
}

export function DiscountForm({ title, subtitle, inherited, inheritedLabel, current, onApply, onClear }: DiscountFormProps) {
  const [value, setValue] = useState(String(current ?? inherited));
  const apply = () => {
    const n = parseFloat(value);
    if (Number.isFinite(n)) onApply(clampPct(n));
  };
  return (
    <>
      <div className="tr-pop-head">
        <div className="t">{title}</div>
        <div className="s">{subtitle ?? `Overrides the ${inheritedLabel} ${inherited}%`}</div>
      </div>
      <div className="tr-pop-form">
        <div className="row">
          <span className="tr-pct-field">
            <input inputMode="decimal" aria-label="Discount percent" value={value} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.target.select()} onKeyDown={(e) => { if (e.key === "Enter") apply(); }} />
            <span>%</span>
          </span>
          <span className="tr-note">off TCGplayer</span>
        </div>
      </div>
      <div className="tr-pop-actions">
        {current !== undefined && <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>Use {inherited}%</button>}
        <button type="button" className="btn btn-primary btn-sm" onClick={apply}>Apply</button>
      </div>
    </>
  );
}

function ManualForm({ current, discount, onApply, onClear }: { current: number | undefined; discount: number; onApply: (n: number) => void; onClear: () => void }) {
  const [value, setValue] = useState(current === undefined ? "" : String(current));
  const n = parseFloat(value);
  const valid = Number.isFinite(n) && n >= 0;
  const apply = () => { if (valid) onApply(n); };
  return (
    <>
      <div className="tr-pop-head">
        <div className="t">Manual price</div>
        <div className="s">Replaces the fetched price and condition adjustment</div>
      </div>
      <div className="tr-pop-form">
        <div className="row">
          <span className="tr-pct-field">
            <span className="pre">$</span>
            <input inputMode="decimal" aria-label="Manual price in dollars" placeholder="0.00" value={value} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.target.select()} onKeyDown={(e) => { if (e.key === "Enter") apply(); }} />
          </span>
        </div>
        <div className="tr-note">
          {valid ? <>Counts as <b>{usd(n * (1 - discount / 100))}</b> after −{discount}% discount</> : <>Discount (−{discount}%) still applies</>}
        </div>
      </div>
      <div className="tr-pop-actions">
        {current !== undefined && <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>Use fetched price</button>}
        <button type="button" className="btn btn-primary btn-sm" onClick={apply} disabled={!valid}>Apply</button>
      </div>
    </>
  );
}
