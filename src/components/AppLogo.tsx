// src/components/AppLogo.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Inline SVG logo — uses CSS custom properties so it adapts to every
// theme mode (dark/light) and accent color automatically. No PNG, no imports.
//
// Size is controlled entirely by CSS (.app-logo in App.css) via the viewBox
// aspect ratio (280×64). Do not add explicit width/height attributes here.
//
// The occluder rect uses fill="var(--bg)" so back-card strokes are always
// hidden behind the front card regardless of the active surface color.
// The "list" gradient uses var(--accent) → var(--accent-light), so
// switching accent (Indigo / Sapphire / Emerald / Ember) updates the logo too.
// ─────────────────────────────────────────────────────────────────────────────

interface AppLogoProps {
  className?: string;
}

export function AppLogo({ className }: AppLogoProps) {
  // Card geometry — tuned to match the fanned-3-card + checkmark design
  const cw = 26, ch = 34;
  const fx = (52 - cw) / 2;          // front card left  = 13
  const fy = (52 - ch) / 2 - 1;      // front card top   = 8
  const pivX = fx + cw / 2;          // fan pivot x = 26
  const pivY = fy + ch;              // fan pivot y = 42
  const backRotate = -14;
  const midRotate  = backRotate * 0.5;
  const radius  = 3;
  const strokeW = 1.6;

  // Checkmark anchor points (inside front card)
  const ckx  = fx + 5,          cky  = fy + ch * 0.52;
  const ckmx = fx + cw * 0.40,  ckmy = fy + ch * 0.73;
  const ckex = fx + cw - 4,     ckey = fy + ch * 0.30;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 280 64"
      aria-label="Fetchlist"
      className={className}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        {/*
          Fixed gradient ID — only one logo renders per page so collisions
          aren't a concern. Uses CSS vars so accent swaps update the gradient.
        */}
        <linearGradient id="fl-logo-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-light)" />
        </linearGradient>
      </defs>

      <g transform="translate(4, 6)">
        {/* Back card — most rotated, lowest opacity */}
        <rect
          x={fx} y={fy} width={cw} height={ch} rx={radius} ry={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={strokeW}
          opacity={0.38}
          transform={`rotate(${backRotate}, ${pivX}, ${pivY})`}
        />

        {/* Mid card — half rotation */}
        <rect
          x={fx} y={fy} width={cw} height={ch} rx={radius} ry={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={strokeW}
          opacity={0.65}
          transform={`rotate(${midRotate}, ${pivX}, ${pivY})`}
        />

        {/*
          Occluder — same shape as front card, filled with --bg.
          Painted between mid and front strokes so back/mid lines that
          would otherwise bleed through the front card are hidden.
          This is the key trick; do not remove it.
        */}
        <rect
          x={fx} y={fy} width={cw} height={ch} rx={radius} ry={radius}
          fill="var(--bg)"
          stroke="none"
        />

        {/* Front card outline */}
        <rect
          x={fx} y={fy} width={cw} height={ch} rx={radius} ry={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={strokeW}
        />

        {/* Checkmark */}
        <polyline
          points={`${ckx},${cky} ${ckmx},${ckmy} ${ckex},${ckey}`}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/*
        Wordmark — "Fetch" inherits fill="var(--text)" (white on dark, dark
        on light). "list" overrides with the accent gradient so colour changes
        update the wordmark too.
      */}
      <text
        x="62" y="42"
        fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif"
        fontSize="28"
        fontWeight="700"
        letterSpacing="-0.4"
        fill="var(--text)"
      >
        Fetch<tspan fill="url(#fl-logo-grad)">list</tspan>
      </text>
    </svg>
  );
}
