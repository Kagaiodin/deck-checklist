import { useEffect, useRef, useState } from "react";
import "./DriveConflictModal.css";

export interface DriveConflictSummary {
  modifiedTime: string;
  deckCount: number;
  cardCount: number;
}

interface Props {
  drive: DriveConflictSummary;
  local: { deckCount: number; cardCount: number };
  onKeepDrive: () => void;
  onKeepLocal: () => void;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// Local data has no persisted timestamp — this app doesn't autosave to
// localStorage, so "recency" can only be shown for the Drive side. Rather
// than fabricate a local date, the copy honestly frames both options by
// what's actually known (content counts) and lets the user decide.
export function DriveConflictModal({ drive, local, onKeepDrive, onKeepLocal }: Props) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<"drive" | "local">("drive");

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    modalRef.current?.querySelector<HTMLElement>('[role="radio"]')?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { onKeepLocal(); return; }
      if (e.key !== "Tab") return;
      const modal = modalRef.current;
      if (!modal) return;
      const focusable = modal.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      prev?.focus();
    };
  }, [onKeepLocal]);

  function confirm() {
    if (selected === "drive") onKeepDrive();
    else onKeepLocal();
  }

  return (
    <div className="drive-conflict-backdrop" onClick={e => { if (e.target === e.currentTarget) onKeepLocal(); }}>
      <div className="drive-conflict-modal" role="dialog" aria-modal="true" aria-labelledby="drive-conflict-title" ref={modalRef}>
        <div className="drive-conflict-kicker">versions don't match</div>
        <h4 id="drive-conflict-title">Keep which version?</h4>
        <p className="drive-conflict-lead">Your Drive backup and this device have different data. Pick one to keep — the other will be replaced.</p>

        <div className="drive-conflict-opts" role="radiogroup" aria-label="Choose version to keep">
          <button
            type="button"
            className={`drive-conflict-opt${selected === "drive" ? " is-sel" : ""}`}
            role="radio"
            aria-checked={selected === "drive"}
            tabIndex={selected === "drive" ? 0 : -1}
            onClick={() => setSelected("drive")}
          >
            <span className="drive-conflict-radio" aria-hidden="true" />
            <span className="drive-conflict-opt-body">
              <span className="drive-conflict-opt-top">Google Drive</span>
              <span className="drive-conflict-opt-when">{formatWhen(drive.modifiedTime)}</span>
              <span className="drive-conflict-opt-stat">{drive.cardCount} cards · {drive.deckCount} decks</span>
            </span>
          </button>
          <button
            type="button"
            className={`drive-conflict-opt${selected === "local" ? " is-sel" : ""}`}
            role="radio"
            aria-checked={selected === "local"}
            tabIndex={selected === "local" ? 0 : -1}
            onClick={() => setSelected("local")}
          >
            <span className="drive-conflict-radio" aria-hidden="true" />
            <span className="drive-conflict-opt-body">
              <span className="drive-conflict-opt-top">This device</span>
              <span className="drive-conflict-opt-when">Currently open in Fetchlist</span>
              <span className="drive-conflict-opt-stat">{local.cardCount} cards · {local.deckCount} decks</span>
            </span>
          </button>
        </div>

        <p className="drive-conflict-caution">This can't be undone. The copy you don't keep is overwritten.</p>

        <div className="drive-conflict-foot">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onKeepLocal}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={confirm}>
            {selected === "drive" ? "Keep Drive version" : "Keep this device"}
          </button>
        </div>
      </div>
    </div>
  );
}
