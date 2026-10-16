import { isDemoActive } from "./demoMode";
import "./demo.css";

interface Props {
  onExit: () => void;
  storage?: Storage;
}

export function DemoBanner({ onExit, storage = window.localStorage }: Props) {
  if (!isDemoActive(storage)) return null;
  return (
    <div className="demo-banner" role="status">
      <span>Demo mode · sample data</span>
      <button type="button" className="demo-banner-exit" onClick={onExit}>Exit</button>
    </div>
  );
}
