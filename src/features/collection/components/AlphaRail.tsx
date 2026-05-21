import { useRef } from "react";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

interface AlphaRailProps {
  letterIndexMap: Map<string, number>;
  activeLetter: string | null;
  onJump: (letter: string) => void;
}

export function AlphaRail({ letterIndexMap, activeLetter, onJump }: AlphaRailProps) {
  const railRef = useRef<HTMLDivElement>(null);

  function handlePointer(e: React.PointerEvent<HTMLDivElement>) {
    if (e.buttons === 0 && e.type === "pointermove") return;
    const rail = railRef.current;
    if (!rail) return;
    const rect = rail.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const letter = LETTERS[Math.min(25, Math.floor(pct * 26))];
    if (letter) onJump(letter);
  }

  return (
    <div
      className="alpha-rail"
      ref={railRef}
      onPointerDown={handlePointer}
      onPointerMove={handlePointer}
    >
      {LETTERS.split("").map(letter => (
        <span
          key={letter}
          className={[
            "alpha-rail-item",
            !letterIndexMap.has(letter) ? "empty" : "",
            letter === activeLetter    ? "active" : "",
          ].filter(Boolean).join(" ")}
        >
          {letter}
        </span>
      ))}
    </div>
  );
}
