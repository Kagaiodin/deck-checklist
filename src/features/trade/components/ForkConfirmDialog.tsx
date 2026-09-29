import { TradeSheet } from "./TradeSheet";

interface ForkConfirmDialogProps {
  onCancel: () => void;
  onReplace: () => void;
  /** Escape hatch: copies the local trade that Replace would discard. */
  onCopyMine: () => void;
}

/** Shown only when the local trade has cards or cash. Cancel is the focused, safe default. */
export function ForkConfirmDialog({ onCancel, onReplace, onCopyMine }: ForkConfirmDialogProps) {
  return (
    <TradeSheet
      title="Replace your current trade?"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCopyMine}>Copy mine as text</button>
          <span className="tr-spacer" />
          <button type="button" className="btn btn-secondary" data-autofocus onClick={onCancel}>Cancel</button>
          <button type="button" className="btn tr-btn-destructive" onClick={onReplace}>Replace</button>
        </>
      }
    >
      <div className="tr-dialog">
        <p>Forking this shared trade replaces the trade you have in progress. You can undo it right after.</p>
        <p>Want to keep yours? Copy it as text first.</p>
      </div>
    </TradeSheet>
  );
}
