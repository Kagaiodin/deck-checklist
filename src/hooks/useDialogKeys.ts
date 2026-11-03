import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * Shared keyboard behaviour for modal dialogs and sheets:
 * - Escape calls `onClose`
 * - Tab / Shift+Tab cycle inside `ref`
 * - focus moves into `ref` when it activates (unless something inside already has it)
 *   and returns to the previously focused element when it deactivates or unmounts
 *
 * `ref` is read lazily, so it may point at a different element from one render to the
 * next (e.g. a sheet that swaps sub-views). Options:
 * - `active`: set false while the dialog isn't rendered (default true)
 * - `initialFocus`: picks the element to focus first; falls back to the first focusable
 */
export function useDialogKeys(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  { active = true, initialFocus }: { active?: boolean; initialFocus?: () => HTMLElement | null | undefined } = {},
) {
  // Held in refs so inline callbacks don't re-run the effect on every render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const initialFocusRef = useRef(initialFocus);
  initialFocusRef.current = initialFocus;

  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const initial = ref.current;
    if (initial && !initial.contains(document.activeElement)) {
      (initialFocusRef.current?.() ?? initial.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeRef.current();
        return;
      }
      const root = ref.current;
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
  }, [ref, active]);
}
