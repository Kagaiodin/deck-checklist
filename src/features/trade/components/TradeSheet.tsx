import { useEffect, useRef, type ReactNode } from "react";
import { useDialogKeys } from "../../../hooks/useDialogKeys";
import { createPortal } from "react-dom";
import { XIcon } from "./TradeIcons";

interface TradeSheetProps {
  title: string;
  chip?: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

/** Centered modal on desktop, bottom sheet on phones (see TradePage.css). */
export function TradeSheet({ title, chip, onClose, footer, children }: TradeSheetProps) {
  const ref = useRef<HTMLDivElement>(null);

  // A control marked data-autofocus wins (e.g. the safe button in a confirm); else the first input.
  useDialogKeys(ref, onClose, {
    initialFocus: () => ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? ref.current?.querySelector<HTMLElement>("input"),
  });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return createPortal(
    <div className="tr-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="tr-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="tr-sheet-head">
          <h3>{title}</h3>
          {chip && <span className="tr-chip">{chip}</span>}
          <span className="tr-spacer" />
          <button type="button" className="tr-icon-btn" aria-label="Close" onClick={onClose}><XIcon /></button>
        </div>
        <div className="tr-sheet-body">{children}</div>
        {footer && <div className="tr-sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
