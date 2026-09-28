import { useEffect } from "react";

export interface ToastState {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
}

const DISMISS_MS = 6000;

export function TradeToast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, DISMISS_MS);
    return () => clearTimeout(t);
    // Re-arm on every new toast, not on a new onDismiss identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.id]);

  if (!toast) return null;
  return (
    <div className="tr-toast-dock">
      <div className="tr-toast" role="status" aria-label="Notification">
        <span>{toast.message}</span>
        {toast.action && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { toast.action!.onClick(); onDismiss(); }}>{toast.action.label}</button>
        )}
      </div>
    </div>
  );
}
