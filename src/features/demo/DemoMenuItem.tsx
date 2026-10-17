import { FlaskIcon } from "../../components/MenuIcons";
import "./demo.css";

interface Props {
  onSelect: () => void;
}

/** Overflow-menu entry for demo mode: a plain item with one line of context beneath it. */
export function DemoMenuItem({ onSelect }: Props) {
  return (
    <>
      <button
        type="button"
        className="overflow-menu-item demo-menu-item"
        aria-describedby="demo-menu-hint"
        onClick={onSelect}
      >
        <FlaskIcon />
        Load sample data
      </button>
      <p className="demo-menu-hint" id="demo-menu-hint">
        Swaps in demo data. Your own data is saved and returns when you exit.
      </p>
    </>
  );
}
