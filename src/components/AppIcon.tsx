interface AppIconProps {
  className?: string;
  style?: React.CSSProperties;
}

export function AppIcon({ className, style }: AppIconProps) {
  const cw = 26, ch = 34;
  const fx = (52 - cw) / 2;
  const fy = (52 - ch) / 2 - 1;
  const pivX = fx + cw / 2;
  const pivY = fy + ch;
  const backRotate = -14;
  const midRotate  = backRotate * 0.5;
  const radius  = 3;
  const strokeW = 1.6;

  const ckx  = fx + 5,          cky  = fy + ch * 0.52;
  const ckmx = fx + cw * 0.40,  ckmy = fy + ch * 0.73;
  const ckex = fx + cw - 4,     ckey = fy + ch * 0.30;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 58 58"
      aria-hidden
      className={className}
      style={{ display: "block", ...style }}
    >
      <g transform="translate(3, 3)">
        <rect
          x={fx} y={fy} width={cw} height={ch} rx={radius} ry={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={strokeW}
          opacity={0.38}
          transform={`rotate(${backRotate}, ${pivX}, ${pivY})`}
        />
        <rect
          x={fx} y={fy} width={cw} height={ch} rx={radius} ry={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={strokeW}
          opacity={0.65}
          transform={`rotate(${midRotate}, ${pivX}, ${pivY})`}
        />
        <rect
          x={fx} y={fy} width={cw} height={ch} rx={radius} ry={radius}
          fill="var(--bg)"
          stroke="none"
        />
        <rect
          x={fx} y={fy} width={cw} height={ch} rx={radius} ry={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={strokeW}
        />
        <polyline
          points={`${ckx},${cky} ${ckmx},${ckmy} ${ckex},${ckey}`}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
