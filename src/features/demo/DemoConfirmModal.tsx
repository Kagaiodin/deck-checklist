import { useRef } from "react";
import { useDialogKeys } from "../../hooks/useDialogKeys";
import "./demo.css";

interface Props {
  onCancel: () => void;
  onConfirm: () => void;
}

export function DemoConfirmModal({ onCancel, onConfirm }: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // The safe-to-confirm button takes focus first; Escape cancels; Tab stays in the dialog.
  useDialogKeys(dialogRef, onCancel, { initialFocus: () => confirmRef.current });

  return (
    <div className="demo-confirm-backdrop" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div ref={dialogRef} className="demo-confirm" role="dialog" aria-modal="true" aria-labelledby="demo-confirm-title">
        <h4 id="demo-confirm-title">Replace your data with sample data?</h4>
        <p>Your data is saved and comes back when you exit demo mode.</p>
        <div className="demo-confirm-foot">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" ref={confirmRef} onClick={onConfirm}>Load sample data</button>
        </div>
      </div>
    </div>
  );
}
