import { useEffect, useRef } from "react";
import "./demo.css";

interface Props {
  onCancel: () => void;
  onConfirm: () => void;
}

export function DemoConfirmModal({ onCancel, onConfirm }: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Callers pass inline handlers; keep the latest in a ref so the effect runs once.
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onCancelRef.current = onCancel; });

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancelRef.current();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, []);

  return (
    <div className="demo-confirm-backdrop" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="demo-confirm" role="dialog" aria-modal="true" aria-labelledby="demo-confirm-title">
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
