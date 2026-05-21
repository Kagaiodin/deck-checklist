import type { CollectionPrinting } from "../../../types/index";
import type { CommittedInfo, EditingPrinting } from "../../../types/collection";
import { CollectionRowDetail } from "./CollectionRowDetail";

interface CollectionRowProps {
  name: string;
  printings: CollectionPrinting[];
  total: number;
  isExpanded: boolean;
  committed: CommittedInfo;
  hasDeckContext: boolean;
  editingPrinting: EditingPrinting | null;
  onToggleExpand: (name: string) => void;
  onAddCopy: (name: string) => void;
  onRemove: (name: string) => void;
  onStartEdit: (ep: EditingPrinting) => void;
  onEditField: (ep: EditingPrinting) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
}

/** Derives a display name by title-casing word boundaries in the lowercase key. */
function toDisplayName(key: string): string {
  return key.replace(/(?:^|\s|-)\S/g, c => c.toUpperCase());
}

export function CollectionRow({
  name,
  printings,
  total,
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
  const freeCount = Math.max(0, total - committed.total);
  // "free" = has deck context, but none of this card is committed to any deck
  const isFree = hasDeckContext && committed.total === 0;
  // "partially free" = some committed, some not — show "N free" on the right
  const isPartiallyFree = hasDeckContext && committed.total > 0 && freeCount > 0;

  // Build the subtitle: "N printings [· +N foil] [· in N decks | · free]"
  const subtitleParts: string[] = [
    `${printings.length} printing${printings.length !== 1 ? "s" : ""}`,
  ];
  if (foilCount > 0) subtitleParts.push(`+${foilCount} foil`);
  if (hasDeckContext) {
    if (committed.deckCount > 0) {
      subtitleParts.push(`in ${committed.deckCount} deck${committed.deckCount !== 1 ? "s" : ""}`);
    } else {
      subtitleParts.push("free");
    }
  }

  return (
    <div
      data-collection-key={name}
      className={[
        "collection-row",
        isExpanded ? "expanded" : "",
        isFree     ? "row-free" : "",
      ].filter(Boolean).join(" ")}
    >
      <button
        className="collection-row-summary"
        onClick={() => onToggleExpand(name)}
        aria-expanded={isExpanded}
      >
        <div className="collection-row-left">
          <span className="collection-card-name">{toDisplayName(name)}</span>
          <span className="collection-row-subtitle">{subtitleParts.join(" · ")}</span>
        </div>
        <div className="collection-row-right">
          <span className="collection-card-qty-big">{total}×</span>
          {isPartiallyFree && (
            <span className="collection-card-free">{freeCount} free</span>
          )}
        </div>
      </button>

      {isExpanded && (
        <CollectionRowDetail
          name={name}
          printings={printings}
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
