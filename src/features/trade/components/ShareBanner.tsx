import { ForkIcon } from "./TradeIcons";

interface ShareBannerProps {
  snapshotAt: number | null;
  onFork: () => void;
}

export function ShareBanner({ snapshotAt, onFork }: ShareBannerProps) {
  const when = snapshotAt
    ? new Date(snapshotAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "an unknown time";
  return (
    <div className="tr-banner" role="region" aria-label="Shared trade">
      <ForkIcon size={18} />
      <div>
        <div className="t">Shared trade — prices as of {when}</div>
        <div className="s">Your side is on the left. This is a read-only copy; nothing here changes your own trade.</div>
      </div>
      <span className="tr-spacer" />
      <button type="button" className="btn btn-primary" onClick={onFork}><ForkIcon />Fork into my own trade</button>
    </div>
  );
}
