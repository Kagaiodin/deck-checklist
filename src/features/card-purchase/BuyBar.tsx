import "./buy-flow.css";

interface Props {
  count: number;
  onClick: () => void;
}

export function BuyBar({ count, onClick }: Props) {
  if (count === 0) return null;

  return (
    <div className="buy-bar" role="status">
      <div className="buy-bar-info">
        <span className="buy-bar-dot" aria-hidden="true" />
        <span className="buy-bar-label">{count} card{count !== 1 ? "s" : ""} to buy</span>
      </div>
      <button className="buy-bar-btn" onClick={onClick}>
        Buy list →
      </button>
    </div>
  );
}
