import { useState, useEffect } from "react";
import type { DeckExtraInfo as DeckExtraInfoType } from "../types/index";

interface Props {
  extraInfo: DeckExtraInfoType | undefined;
  isLoading?: boolean;
}

function tokenDotClass(typeLine: string): string {
  if (typeLine.includes("Emblem")) return "ei-dot-emblem";
  if (typeLine.includes("Artifact")) return "ei-dot-artifact";
  if (typeLine.includes("Creature")) return "ei-dot-creature";
  return "ei-dot-copy";
}

const LS_KEY = "fetchlist:extrainfo-open";

export function DeckExtraInfo({ extraInfo, isLoading }: Props) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, open ? "1" : "0"); } catch {}
  }, [open]);

  if (!extraInfo && !isLoading) return null;

  const hasTokens = (extraInfo?.tokens.length ?? 0) > 0;
  const hasAltPrintings = (extraInfo?.altPrintings.length ?? 0) > 0;
  const isEmpty = !isLoading && !hasTokens && !hasAltPrintings;

  const summaryParts: string[] = [];
  if (hasTokens) summaryParts.push(`${extraInfo!.tokens.length} token${extraInfo!.tokens.length !== 1 ? "s" : ""}`);
  if (hasAltPrintings) summaryParts.push(`${extraInfo!.altPrintings.length} alt name${extraInfo!.altPrintings.length !== 1 ? "s" : ""}`);

  return (
    <div className="ei-section">
      <button
        className="ei-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className={`ei-chevron${open ? " open" : ""}`}>▶</span>
        <span className="ei-title">Extra Info</span>
        {!open && summaryParts.length > 0 && (
          <span className="ei-summary">
            {summaryParts.map(p => (
              <span key={p} className="ei-badge">{p}</span>
            ))}
          </span>
        )}
      </button>

      {open && (
        <div className="ei-body">
          {isLoading && !extraInfo && (
            <p className="ei-loading">Enriching deck data…</p>
          )}

          {isEmpty && (
            <p className="ei-empty">No tokens or alternate printings found for this deck.</p>
          )}

          {hasTokens && (
            <div className="ei-subsection">
              <div className="ei-sub-label">Tokens needed</div>
              <div className="token-chips">
                {extraInfo!.tokens.map(t => (
                  <span key={t.name} className="token-chip">
                    <span className={`ei-dot ${tokenDotClass(t.typeLine)}`} />
                    {t.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {hasAltPrintings && (
            <div className="ei-subsection">
              <div className="ei-sub-label">Alternate printings</div>
              <div className="alt-print-list">
                {extraInfo!.altPrintings.map(ap => (
                  <div key={`${ap.cardName}-${ap.setCode}`} className="alt-print-row">
                    <span className="alt-print-name">{ap.cardName}</span>
                    <span className="alt-print-edition">{ap.setCode} · {ap.altName}</span>
                    <a
                      className="alt-print-scryfall"
                      href={`https://scryfall.com/search?q=!"${encodeURIComponent(ap.cardName)}"+set:${ap.setCode.toLowerCase()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      ↗
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
