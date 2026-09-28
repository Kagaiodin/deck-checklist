import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface PopoverProps {
  /** The button that opened it. Focus returns here on close; clicks on it don't count as "outside". */
  anchor: HTMLElement | null;
  label: string;
  role?: "dialog" | "menu";
  onClose: () => void;
  children: ReactNode;
}

/**
 * Small anchored popover, portalled and fixed-positioned so offer panels
 * (overflow: hidden) can't clip it. Escape and outside-click close it.
 */
export function Popover({ anchor, label, role = "dialog", onClose, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const r = anchor.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = ref.current;
    let left = r.right - w;
    if (left < 8) left = Math.min(r.left, window.innerWidth - w - 8);
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = r.top - h - 6;
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [anchor]);

  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>("input, select, button");
    first?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
      anchor?.focus({ preventScroll: true });
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      className="tr-pop"
      role={role}
      aria-label={label}
      style={{ position: "fixed", left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
    >
      {children}
    </div>,
    document.body
  );
}
