import type { ReactNode } from "react";

// Header overflow-menu icons. 1.8-stroke line icons, same style as TradeIcons.
const icon = (paths: ReactNode) =>
  function Icon({ size = 15 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {paths}
      </svg>
    );
  };

export const BugIcon = icon(<><rect x="8" y="7" width="8" height="13" rx="4" /><path d="M9.5 7a2.5 2.5 0 0 1 5 0" /><path d="M12 11v9M3 13h5M16 13h5M4 8l4 2M20 8l-4 2M4 19l4-2M20 19l-4-2" /></>);
export const LightbulbIcon = icon(<><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" /></>);
export const FlaskIcon = icon(<><path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" /><path d="M7 15h10" /></>);
