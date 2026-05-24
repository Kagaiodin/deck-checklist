import { useEffect, useRef } from "react";
import "./OnboardingModal.css";

interface Props {
  onDismiss: () => void;
  onImportDeck: () => void;
}

export function OnboardingModal({ onDismiss, onImportDeck }: Props) {
  const modalRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // Focus trap + Escape key
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    firstFocusRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onDismiss();
        return;
      }
      if (e.key !== "Tab") return;
      const modal = modalRef.current;
      if (!modal) return;
      const focusable = modal.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
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
  }, [onDismiss]);

  function handleImport() {
    onImportDeck();
    // onImportDeck calls onDismiss internally (sets flag + opens import)
  }

  return (
    <div className="onboarding-backdrop" aria-modal="true" onClick={e => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div
        className="onboarding-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        ref={modalRef}
      >
        {/* ① Close button */}
        <button
          className="onboarding-close"
          aria-label="Close onboarding"
          onClick={onDismiss}
          ref={firstFocusRef}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M1 1l12 12M13 1L1 13" />
          </svg>
        </button>

        {/* ② Product icon */}
        <div className="onboarding-product-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </div>

        {/* ③ Headline */}
        <h2 className="onboarding-headline" id="onboarding-title">
          Track every card you need
        </h2>

        {/* ④ Body */}
        <p className="onboarding-body">
          Fetchlist tracks cards you're missing across all your MTG decks — so you know exactly what to buy, order, or proxy next.
        </p>

        {/* ⑤ Feature list */}
        <div className="onboarding-features">
          <div className="onboarding-feature">
            <div className="onboarding-feat-icon onboarding-feat-icon--green" aria-hidden="true">
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M2 7l3.5 3.5 6.5-6.5" />
              </svg>
            </div>
            <div className="onboarding-feat-text">
              <strong>Auto-tag from your collection</strong>
              <span>Upload a Moxfield CSV to mark owned cards across every deck instantly.</span>
            </div>
          </div>
          <div className="onboarding-feature">
            <div className="onboarding-feat-icon onboarding-feat-icon--blue" aria-hidden="true">
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 1v12M1 7h12" />
              </svg>
            </div>
            <div className="onboarding-feat-text">
              <strong>Import any deck</strong>
              <span>Paste a decklist or import via standard formats — Moxfield, MTGO, Arena.</span>
            </div>
          </div>
        </div>

        {/* ⑥ CTA stack */}
        <div className="onboarding-cta">
          <button className="onboarding-btn-import" onClick={handleImport}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            Import a deck
          </button>
          <button className="onboarding-btn-skip" onClick={onDismiss}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
