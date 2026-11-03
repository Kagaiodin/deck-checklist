import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * Shared keyboard behaviour for modal dialogs and sheets:
 * - Escape calls `onClose`
 * - Tab / Shift+Tab cycle inside `ref`
 * - focus moves into `ref` on mount (unless something inside already has it)
 *   and returns to the previously focused element on unmount
 */
export function useDialogKeys(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  // Held in a ref so an inline onClose doesn't re-run the effect on every render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const root = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    if (root && !root.contains(document.activeElement)) {
      root.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!root.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [ref]);
}
