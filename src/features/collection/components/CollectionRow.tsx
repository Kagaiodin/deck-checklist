import type { Card, CollectionPrinting } from "../../../types/index";
import type { CommittedInfo, EditingPrinting } from "../../../types/collection";
import { CollectionRowDetail } from "./CollectionRowDetail";

interface CollectionRowProps {
  name: string;
  printings: CollectionPrinting[];
  total: number;
  rarity?: Card["rarity"];
  isExpanded: boolean;
  committed: CommittedInfo;
  hasDeckContext: boolean;
  editingPrinting: EditingPrinting | null;
  onToggleExpand: (name: string) => void;
  /** Set-group mode: the id this row expands under (a card repeats across groups). */
  rowKey?: string;
  /** Set-group mode: index of each shown printing in the card's full list. */
  indices?: number[];
  /** Set-group mode: length of the card's full printings list. */
  fullCount?: number;
  /** Set-group mode: set code shown in the subtitle and prefilled on new printings. */
  groupSet?: string | null;
  onAddCopy: (name: string, idx?: number) => void;
  onRemove: (name: string, indices?: number[]) => void;
  onStartEdit: (ep: EditingPrinting) => void;
  onEditField: (ep: EditingPrinting) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
}

function toDisplayName(key: string): string {
  return key.replace(/(?:^|\s|-)\S/g, c => c.toUpperCase());
}

export function CollectionRow({
  name,
  printings,
  total,
  rarity,
  rowKey = name,
  indices,
  fullCount,
  groupSet,
  isExpanded,
  committed,
  hasDeckContext,
  editingPrinting,
  onToggleExpand,
  onAddCopy,
  onRemove,
  onStartEdit,
  onEditField,
  onCommitEdit,
  onCancelEdit,
}: CollectionRowProps) {
  const foilCount = printings.reduce((n, p) => n + (p.foil ? p.quantity : 0), 0);
  const rawFree = Math.max(0, total - committed.total);
  // "free" only meaningful when decks are loaded — without deck context every
  // card would appear amber since committed.total is always 0.
  const freeCount = hasDeckContext ? rawFree : 0;

  // Amber stripe overrides rarity when card has free copies
  const stripeKey: string | null =
    freeCount > 0 ? "free" : (rarity ?? null);

  // Subtitle: omit each segment when count is 0
  const subtitleParts: string[] = groupSet !== undefined
    ? [groupSet ?? "No set", ...(rarity ? [rarity] : [])]
    : [`${printings.length} printing${printings.length !== 1 ? "s" : ""}`];
  if (foilCount > 0) subtitleParts.push(`${foilCount} foil`);
  if (hasDeckContext && committed.deckCount > 0) {
    subtitleParts.push(`${committed.deckCount} deck${committed.deckCount !== 1 ? "s" : ""}`);
  }

  return (
    <div
      data-collection-key={name}
      className={["collection-row", isExpanded ? "expanded" : ""].filter(Boolean).join(" ")}
    >
      {stripeKey && (
        <div className="collection-row-stripe" data-rarity={stripeKey} />
      )}

      <button
        className="collection-row-summary"
        onClick={() => onToggleExpand(rowKey)}
        aria-expanded={isExpanded}
      >
        <div className="collection-row-left">
          <span className="collection-card-name">{toDisplayName(name)}</span>
          <span className="collection-row-subtitle">{subtitleParts.join(" · ")}</span>
        </div>
        <div className="collection-row-right">
          {freeCount > 0 && (
            <span className="collection-card-free">{freeCount} unassigned</span>
          )}
          <span
            className="collection-card-qty-big"
            data-free={freeCount > 0 ? "true" : undefined}
          >
            {total}×
          </span>
        </div>
      </button>

      {isExpanded && (
        <CollectionRowDetail
          name={name}
          printings={printings}
          indices={indices}
          fullCount={fullCount}
          groupSet={groupSet}
          committed={committed}
          hasDeckContext={hasDeckContext}
          editingPrinting={editingPrinting}
          onAddCopy={onAddCopy}
          onStartEdit={onStartEdit}
          onEditField={onEditField}
          onCommitEdit={onCommitEdit}
          onCancelEdit={onCancelEdit}
          onRemove={onRemove}
        />
      )}
    </div>
  );
}
