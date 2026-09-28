import type { ReactNode } from "react";

// 1.8-stroke line icons, same style as the app's EmptyState svgs.
const icon = (paths: ReactNode) =>
  function Icon({ size = 16 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {paths}
      </svg>
    );
  };

export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);
export const SearchIcon = icon(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const StackIcon = icon(<><rect x="3" y="6" width="13" height="15" rx="2" /><rect x="8" y="3" width="13" height="15" rx="2" /></>);
export const MoreIcon = icon(<><circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="19" cy="12" r="1.2" fill="currentColor" /></>);
export const RefreshIcon = icon(<><path d="M20 11a8 8 0 0 0-14.8-4.2L3 9" /><path d="M3 4v5h5" /><path d="M4 13a8 8 0 0 0 14.8 4.2L21 15" /><path d="M21 20v-5h-5" /></>);
export const SwapIcon = icon(<><path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="m17 20 4-4-4-4" /><path d="M21 16H7" /></>);
export const TrashIcon = icon(<><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>);
export const UndoIcon = icon(<><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>);
export const RedoIcon = icon(<><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></>);
export const LinkIcon = icon(<><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>);
export const CheckIcon = icon(<><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>);
export const TiltIcon = icon(<><path d="M12 3v18M5 21h14" /><path d="M4 9l16-3" /><path d="m4 9-2 5h4z" /><path d="m20 6-2 5h4z" /></>);
export const AlertIcon = icon(<><path d="M12 3 2 21h20z" /><path d="M12 10v5M12 18h.01" /></>);
export const ScaleIcon = icon(<><path d="M12 3v18M5 21h14M4 8h16" /><path d="m4 8-2 5h4zM20 8l-2 5h4z" /></>);
export const ClockIcon = icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const PencilIcon = icon(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13 7 4 4" /></>);
export const PercentIcon = icon(<><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>);
export const InfoIcon = icon(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>);
export const XIcon = icon(<path d="M6 6l12 12M18 6 6 18" />);
export const ForkIcon = icon(<><circle cx="6" cy="5" r="2" /><circle cx="18" cy="5" r="2" /><circle cx="12" cy="19" r="2" /><path d="M6 7v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7M12 12v5" /></>);
export const BrokenLinkIcon = icon(<><path d="M9 15l-2 2a3.5 3.5 0 0 1-5-5l2-2M15 9l2-2a3.5 3.5 0 0 1 5 5l-2 2" /><path d="M8 3v3M3 8h3M16 21v-3M21 16h-3" /></>);
export const CashIcon = icon(<><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>);
export const TextIcon = icon(<path d="M4 6h16M4 12h16M4 18h10" />);
export const LockIcon = icon(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>);
export const ChevronIcon = icon(<path d="m9 6 6 6-6 6" />);
