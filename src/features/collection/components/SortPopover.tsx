import type { CollectionSortKey } from "../../../types/collection";

const SORT_OPTIONS: { value: CollectionSortKey; label: string }[] = [
  { value: "name-asc",  label: "Name A→Z" },
  { value: "name-desc", label: "Name Z→A" },
  { value: "qty-desc",  label: "Qty ↓" },
  { value: "qty-asc",   label: "Qty ↑" },
];

interface SortPopoverProps {
  collectionSort: CollectionSortKey;
  onSortChange: (key: CollectionSortKey) => void;
  onClose: () => void;
}

export function SortPopover({ collectionSort, onSortChange, onClose }: SortPopoverProps) {
  return (
    <div className="sort-popover">
      {SORT_OPTIONS.map(opt => (
        <button
          key={opt.value}
          className={`sort-option${collectionSort === opt.value ? " active" : ""}`}
          onClick={() => { onSortChange(opt.value); onClose(); }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export { SORT_OPTIONS };
