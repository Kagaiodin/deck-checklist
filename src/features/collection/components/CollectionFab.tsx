interface CollectionFabProps {
  onClick: () => void;
}

export function CollectionFab({ onClick }: CollectionFabProps) {
  return (
    <button className="collection-fab" onClick={onClick} aria-label="Add card">
      +
    </button>
  );
}
