import type { ReactNode, SVGProps } from "react";

/**
 * Icons — the single source for every SVG glyph in the product (web + extension).
 * Never inline an `<svg>` icon in a surface; add it here and import it, so the same
 * artwork renders everywhere (see packages/ui/README.md).
 *
 * All icons are 24×24 stroke glyphs on `currentColor` unless noted. Size defaults to
 * 16px via width/height attributes — any `h-* w-*` in `className` still wins (CSS beats
 * presentation attributes), so existing call-site sizing keeps working. Stroke weight
 * has a per-icon default matching its established look; override with `strokeWidth`.
 */
export interface IconProps extends SVGProps<SVGSVGElement> {
  /** Rendered size in px (width & height). Classes like `h-4 w-4` override it. */
  size?: number;
}

interface IconDef {
  node: ReactNode;
  viewBox?: string;
  /** false → solid glyph (fill: currentColor, no stroke). Default true (stroke glyph). */
  stroke?: boolean;
  strokeWidth?: number;
}

function makeIcon(name: string, def: IconDef) {
  const strokeProps =
    def.stroke === false
      ? { fill: "currentColor" as const }
      : {
          fill: "none" as const,
          stroke: "currentColor" as const,
          strokeWidth: def.strokeWidth ?? 1.9,
          strokeLinecap: "round" as const,
          strokeLinejoin: "round" as const,
        };
  function Icon({ size = 16, className, ...props }: IconProps) {
    return (
      <svg
        viewBox={def.viewBox ?? "0 0 24 24"}
        width={size}
        height={size}
        aria-hidden
        {...strokeProps}
        className={className}
        {...props}
      >
        {def.node}
      </svg>
    );
  }
  Icon.displayName = name;
  return Icon;
}

/* ── Navigation / chrome ─────────────────────────────────────────────────────────── */

export const ChevronDownIcon = makeIcon("ChevronDownIcon", {
  strokeWidth: 2,
  node: <path d="M6 9l6 6 6-6" />,
});

export const ChevronLeftIcon = makeIcon("ChevronLeftIcon", {
  node: <path d="M15 18l-6-6 6-6" />,
});

export const DashboardIcon = makeIcon("DashboardIcon", {
  node: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
});

export const UserIcon = makeIcon("UserIcon", {
  node: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </>
  ),
});

export const UsersIcon = makeIcon("UsersIcon", {
  node: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20v-1a5 5 0 0 1 5-5h1a5 5 0 0 1 5 5v1" />
      <path d="M16 4.2a3.2 3.2 0 0 1 0 6.1" />
      <path d="M17 14.2a5 5 0 0 1 3.5 4.8v1" />
    </>
  ),
});

export const FileTextIcon = makeIcon("FileTextIcon", {
  node: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </>
  ),
});

// Kanban columns sitting on a common baseline (ragged tops).
export const BoardIcon = makeIcon("BoardIcon", {
  node: (
    <>
      <rect x="3" y="8" width="5" height="12" rx="1.5" />
      <rect x="10" y="4" width="5" height="16" rx="1.5" />
      <rect x="17" y="6" width="4" height="14" rx="1.5" />
    </>
  ),
});

// Lucide "settings" gear — fits the 24×24 box.
export const GearIcon = makeIcon("GearIcon", {
  node: (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
});

export const SignOutIcon = makeIcon("SignOutIcon", {
  node: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
});

export const XIcon = makeIcon("XIcon", {
  viewBox: "0 0 20 20",
  strokeWidth: 1.75,
  node: <path d="M5 5l10 10M15 5L5 15" />,
});

export const CheckIcon = makeIcon("CheckIcon", {
  strokeWidth: 2.5,
  node: <path d="M20 6L9 17l-5-5" />,
});

/* ── Actions ─────────────────────────────────────────────────────────────────────── */

export const SearchIcon = makeIcon("SearchIcon", {
  strokeWidth: 2,
  node: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
});

export const FunnelIcon = makeIcon("FunnelIcon", {
  strokeWidth: 2,
  node: <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />,
});

export const ArrowsUpDownIcon = makeIcon("ArrowsUpDownIcon", {
  strokeWidth: 2,
  node: <path d="M7 4v14M7 18l-3-3M7 18l3-3M17 20V6M17 6l-3 3M17 6l3 3" />,
});

/** Two opposing horizontal arrows: "Swap Section" in the Resume Builder's top bar. */
export const SwapIcon = makeIcon("SwapIcon", {
  strokeWidth: 2,
  node: <path d="M17 3l4 4-4 4M21 7H8M7 21l-4-4 4-4M3 17h13" />,
});

export const TrashIcon = makeIcon("TrashIcon", {
  strokeWidth: 2,
  node: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
});

export const PencilIcon = makeIcon("PencilIcon", {
  strokeWidth: 2,
  node: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
});

export const ArchiveIcon = makeIcon("ArchiveIcon", {
  strokeWidth: 2,
  node: (
    <>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </>
  ),
});

export const RestoreIcon = makeIcon("RestoreIcon", {
  strokeWidth: 2,
  node: (
    <>
      <path d="M3 7v6h6" />
      <path d="M3.5 13a9 9 0 1 0 2.3-9.3L3 7" />
    </>
  ),
});

/** Pass `fill="currentColor"` for the filled (starred) state. */
export const StarIcon = makeIcon("StarIcon", {
  strokeWidth: 2,
  node: <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.8 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" />,
});

export const BookmarkIcon = makeIcon("BookmarkIcon", {
  stroke: false,
  node: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1z" />,
});

export const UploadIcon = makeIcon("UploadIcon", {
  viewBox: "0 0 20 20",
  strokeWidth: 1.6,
  node: <path d="M10 13V4m0 0L6.5 7.5M10 4l3.5 3.5M4 14v1.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V14" />,
});

export const LinkIcon = makeIcon("LinkIcon", {
  strokeWidth: 1.7,
  node: <path d="M9 15l6-6M10.5 6.5l1-1a4 4 0 0 1 5.66 5.66l-2 2M13.5 17.5l-1 1a4 4 0 0 1-5.66-5.66l2-2" />,
});

export const EyeIcon = makeIcon("EyeIcon", {
  strokeWidth: 1.8,
  node: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
});

export const EyeOffIcon = makeIcon("EyeOffIcon", {
  strokeWidth: 1.8,
  node: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
      <path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6.5 0 10 7 10 7a13.4 13.4 0 0 1-3 3.7" />
      <path d="M6.1 6.1A13.4 13.4 0 0 0 2 12s3.5 7 10 7a10.9 10.9 0 0 0 3.2-.5" />
    </>
  ),
});

/** Six-dot drag handle (solid). */
export const GripIcon = makeIcon("GripIcon", {
  viewBox: "0 0 12 12",
  stroke: false,
  node: (
    <>
      <circle cx="3" cy="2.5" r="1.1" />
      <circle cx="9" cy="2.5" r="1.1" />
      <circle cx="3" cy="6" r="1.1" />
      <circle cx="9" cy="6" r="1.1" />
      <circle cx="3" cy="9.5" r="1.1" />
      <circle cx="9" cy="9.5" r="1.1" />
    </>
  ),
});

/* ── Admin / status ──────────────────────────────────────────────────────────────── */

/** A warning triangle — red flags in the job-fit report (13.3). */
export const AlertIcon = makeIcon("AlertIcon", {
  node: (
    <>
      <path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
});

export const ShieldIcon = makeIcon("ShieldIcon", {
  node: <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />,
});

export const ChartIcon = makeIcon("ChartIcon", {
  node: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
});

export const AiIcon = makeIcon("AiIcon", {
  node: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M9 9h6M9 13h6M9 17h3" />
    </>
  ),
});

export const MailIcon = makeIcon("MailIcon", {
  node: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
});

/** Move up / move down - the section and item reorder buttons of the resume canvas. */
export const ArrowUpIcon = makeIcon("ArrowUpIcon", {
  strokeWidth: 2,
  node: <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />,
});

export const ArrowDownIcon = makeIcon("ArrowDownIcon", {
  strokeWidth: 2,
  node: <path d="M12 5v14M5.5 12.5L12 19l6.5-6.5" />,
});

/** A telephone handset - the phone number in the resume header (Resume Builder canvas). */
export const PhoneIcon = makeIcon("PhoneIcon", {
  node: (
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2z" />
  ),
});

/** A conversation — "Contact us" requests (15.6). */
export const MessageIcon = makeIcon("MessageIcon", {
  node: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12z" />,
});

/** A payment card — paying customers (9.C1). */
export const CreditCardIcon = makeIcon("CreditCardIcon", {
  node: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </>
  ),
});

/** Notifications (14.6). */
export const BellIcon = makeIcon("BellIcon", {
  node: (
    <>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
});

export const MonitorIcon = makeIcon("MonitorIcon", {
  node: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
});

export const BugIcon = makeIcon("BugIcon", {
  node: (
    <>
      <rect x="8" y="6" width="8" height="13" rx="4" />
      <path d="M12 6V4M5 9h3M16 9h3M4 13h4M16 13h4M5 17h3M16 17h3" />
    </>
  ),
});

/* ── Marketing / landing v2 glyphs ───────────────────────────────────────────────── */

export const ArrowRightIcon = makeIcon("ArrowRightIcon", {
  strokeWidth: 2.2,
  node: <path d="M5 12h14M13 6l6 6-6 6" />,
});

export const ChevronRightIcon = makeIcon("ChevronRightIcon", {
  strokeWidth: 2,
  node: <path d="M9 18l6-6-6-6" />,
});

export const MenuIcon = makeIcon("MenuIcon", {
  strokeWidth: 2.2,
  node: <path d="M4 7h16M4 12h16M4 17h16" />,
});

/** Solid play triangle (demo button). */
export const PlayIcon = makeIcon("PlayIcon", {
  stroke: false,
  node: <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />,
});

export const SparklesIcon = makeIcon("SparklesIcon", {
  node: (
    <>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </>
  ),
});

export const TargetIcon = makeIcon("TargetIcon", {
  node: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" />
    </>
  ),
});

export const LayoutGridIcon = makeIcon("LayoutGridIcon", {
  node: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
});

export const CalendarIcon = makeIcon("CalendarIcon", {
  node: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </>
  ),
});

/** Outline heart; pass `fill="currentColor"` for the filled state. */
export const HeartIcon = makeIcon("HeartIcon", {
  node: <path d="M12 20.5s-8-4.8-8-11A4.5 4.5 0 0 1 12 6.8 4.5 4.5 0 0 1 20 9.5c0 6.2-8 11-8 11z" />,
});

export const BriefcaseIcon = makeIcon("BriefcaseIcon", {
  node: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2" />
      <path d="M3 13h18" />
    </>
  ),
});

export const GraduationCapIcon = makeIcon("GraduationCapIcon", {
  node: (
    <>
      <path d="M2 9l10-5 10 5-10 5z" />
      <path d="M6 11.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.5" />
      <path d="M22 9v6" />
    </>
  ),
});

/** Two chasing arrows (refresh / sync). `RestoreIcon` stays the undo-style glyph. */
export const RefreshIcon = makeIcon("RefreshIcon", {
  node: (
    <>
      <path d="M20 11a8 8 0 0 0-14.3-4.5L4 8.5" />
      <path d="M4 4v4.5h4.5" />
      <path d="M4 13a8 8 0 0 0 14.3 4.5l1.7-2" />
      <path d="M20 20v-4.5h-4.5" />
    </>
  ),
});

export const ZapIcon = makeIcon("ZapIcon", {
  node: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
});

export const RocketIcon = makeIcon("RocketIcon", {
  node: (
    <>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.9 12.9 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </>
  ),
});

export const LightbulbIcon = makeIcon("LightbulbIcon", {
  node: (
    <>
      <path d="M9 18h6M10 21.5h4" />
      <path d="M12 2.5a6.5 6.5 0 0 0-3.7 11.8c.5.4.7 1 .7 1.7v.5h6V16c0-.7.2-1.3.7-1.7A6.5 6.5 0 0 0 12 2.5z" />
    </>
  ),
});

export const CheckCircleIcon = makeIcon("CheckCircleIcon", {
  node: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M7.8 12.4l3 3 5.6-6" />
    </>
  ),
});

export const ClockIcon = makeIcon("ClockIcon", {
  node: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 6.5V12l3.5 2" />
    </>
  ),
});

export const TrophyIcon = makeIcon("TrophyIcon", {
  node: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5" />
      <path d="M12 14v4M8.5 21h7M9.5 18h5" />
    </>
  ),
});

export const LayersIcon = makeIcon("LayersIcon", {
  node: (
    <>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 12.5l9 5 9-5" />
      <path d="M3 16.5l9 5 9-5" />
    </>
  ),
});

export const ShieldCheckIcon = makeIcon("ShieldCheckIcon", {
  node: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M8.8 12.2l2.2 2.2 4.2-4.6" />
    </>
  ),
});

export const ClipboardIcon = makeIcon("ClipboardIcon", {
  node: (
    <>
      <rect x="5" y="4.5" width="14" height="17" rx="2" />
      <path d="M9 4.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.5" />
      <path d="M9 11h6M9 15h4" />
    </>
  ),
});

export const InboxIcon = makeIcon("InboxIcon", {
  node: (
    <>
      <path d="M3 13l2.7-7.1A2 2 0 0 1 7.6 4.6h8.8a2 2 0 0 1 1.9 1.3L21 13" />
      <path d="M3 13v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5h-5.5a3.5 3.5 0 0 1-7 0z" />
    </>
  ),
});

export const TrendingUpIcon = makeIcon("TrendingUpIcon", {
  strokeWidth: 2.1,
  node: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
});

/** Speech bubble with tail. `MessageIcon` stays the round conversation glyph. */
export const ChatIcon = makeIcon("ChatIcon", {
  node: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H11l-4.5 4v-4H5.5A1.5 1.5 0 0 1 4 14.5z" />
      <path d="M8 9h8M8 12.5h5" />
    </>
  ),
});

export const GlobeIcon = makeIcon("GlobeIcon", {
  node: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M2.5 12h19" />
      <path d="M12 2.5c2.6 2.6 3.9 5.8 3.9 9.5s-1.3 6.9-3.9 9.5c-2.6-2.6-3.9-5.8-3.9-9.5S9.4 5.1 12 2.5z" />
    </>
  ),
});

export const LockIcon = makeIcon("LockIcon", {
  node: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      <path d="M12 15v2" />
    </>
  ),
});

/* ── App v2 glyphs (signed-in app + org admin, spec web/APP-V2-SPEC.md section 2) ───── */

export const HomeIcon = makeIcon("HomeIcon", {
  node: (
    <>
      <path d="M3.5 11.2L12 4l8.5 7.2" />
      <path d="M5.5 9.8V19a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9.8" />
      <path d="M10 20.5v-5h4v5" />
    </>
  ),
});

export const HelpCircleIcon = makeIcon("HelpCircleIcon", {
  node: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.4 9.4a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.2-2.6 3.9" />
      <path d="M12 17.4h.01" />
    </>
  ),
});

/** A circled "i" - tip and info boxes. */
export const InfoIcon = makeIcon("InfoIcon", {
  node: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v5.2" />
      <path d="M12 7.6h.01" />
    </>
  ),
});

export const BuildingIcon = makeIcon("BuildingIcon", {
  node: (
    <>
      <rect x="4.5" y="3" width="11" height="18" rx="1.5" />
      <path d="M15.5 9H18a1.5 1.5 0 0 1 1.5 1.5V21" />
      <path d="M2.5 21h19" />
      <path d="M8 7.5h4M8 11h4M8 14.5h4" />
    </>
  ),
});

/** Three nodes joined by lines (share / network graph). */
export const ShareNodesIcon = makeIcon("ShareNodesIcon", {
  node: (
    <>
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="18" cy="5.5" r="2.6" />
      <circle cx="18" cy="18.5" r="2.6" />
      <path d="M8.3 10.8l7.4-4.1M8.3 13.2l7.4 4.1" />
    </>
  ),
});

/** Paper plane (send / apply). */
export const SendIcon = makeIcon("SendIcon", {
  node: (
    <>
      <path d="M21.5 3L10.5 14" />
      <path d="M21.5 3l-6.6 18-4.4-7-7-4.4z" />
    </>
  ),
});

/** Networking: a hub with satellite people-dots. */
export const NetworkIcon = makeIcon("NetworkIcon", {
  node: (
    <>
      <circle cx="12" cy="8" r="3" />
      <path d="M6.5 20v-.5a5.5 5.5 0 0 1 11 0v.5" />
      <circle cx="4.8" cy="10.5" r="2" />
      <circle cx="19.2" cy="10.5" r="2" />
    </>
  ),
});

export const CompassIcon = makeIcon("CompassIcon", {
  node: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M15.8 8.2l-2 5.6-5.6 2 2-5.6z" />
    </>
  ),
});

export const DownloadIcon = makeIcon("DownloadIcon", {
  node: (
    <>
      <path d="M12 3.5v12M7 11l5 5 5-5" />
      <path d="M4.5 20.5h15" />
    </>
  ),
});

/** Three horizontal dots. */
export const MoreHorizontalIcon = makeIcon("MoreHorizontalIcon", {
  stroke: false,
  node: (
    <>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </>
  ),
});

/** Three vertical dots (row actions). */
export const MoreVerticalIcon = makeIcon("MoreVerticalIcon", {
  stroke: false,
  node: (
    <>
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </>
  ),
});

export const ExternalLinkIcon = makeIcon("ExternalLinkIcon", {
  node: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </>
  ),
});

export const CrownIcon = makeIcon("CrownIcon", {
  node: (
    <>
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />
      <path d="M5.5 19h13" />
    </>
  ),
});

export const KeyIcon = makeIcon("KeyIcon", {
  node: (
    <>
      <circle cx="8" cy="15" r="4.5" />
      <path d="M11.2 11.8L20 3M16.5 6.5l2.5 2.5M14 9l2 2" />
    </>
  ),
});

/** Webhook: three nodes joined by a looping hook. */
export const WebhookIcon = makeIcon("WebhookIcon", {
  node: (
    <>
      <circle cx="12" cy="6" r="2.5" />
      <circle cx="5.5" cy="17.5" r="2.5" />
      <circle cx="18.5" cy="17.5" r="2.5" />
      <path d="M12 8.5l-4.7 6.7M8 17.5h8M13.5 8.2l3.8 6.5" />
    </>
  ),
});

export const ListIcon = makeIcon("ListIcon", {
  node: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" strokeWidth={2.6} />
    </>
  ),
});

/** Alias of LayoutGridIcon under the spec's name. */
export const GridIcon = LayoutGridIcon;
/** Alias of ChartIcon under the spec's name. */
export const BarChartIcon = ChartIcon;
/** Alias of FunnelIcon under the spec's name. */
export const FilterIcon = FunnelIcon;

export const MapPinIcon = makeIcon("MapPinIcon", {
  node: (
    <>
      <path d="M12 21.5s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10.5" r="2.4" />
    </>
  ),
});

export const DollarIcon = makeIcon("DollarIcon", {
  node: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M14.8 9.2c-.4-1-1.4-1.6-2.8-1.6-1.6 0-2.8.8-2.8 2s1 1.6 2.8 2c1.8.4 2.8.9 2.8 2.1s-1.2 2-2.8 2c-1.5 0-2.5-.7-2.9-1.7" />
      <path d="M12 6v1.6M12 16.4V18" />
    </>
  ),
});

export const VideoIcon = makeIcon("VideoIcon", {
  node: (
    <>
      <rect x="3" y="6" width="13" height="12" rx="2.2" />
      <path d="M16 10.5l5-3v9l-5-3z" />
    </>
  ),
});

export const XCircleIcon = makeIcon("XCircleIcon", {
  node: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
});

export const MinusCircleIcon = makeIcon("MinusCircleIcon", {
  node: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M8 12h8" />
    </>
  ),
});

export const PlusIcon = makeIcon("PlusIcon", {
  strokeWidth: 2.2,
  node: <path d="M12 5v14M5 12h14" />,
});

export const MinusIcon = makeIcon("MinusIcon", {
  strokeWidth: 2.2,
  node: <path d="M5 12h14" />,
});

export const PrinterIcon = makeIcon("PrinterIcon", {
  node: (
    <>
      <path d="M6 9V3h12v6" />
      <rect x="3" y="9" width="18" height="9" rx="2" />
      <path d="M7 14h10v7H7z" />
    </>
  ),
});

export const ArrowUpRightIcon = makeIcon("ArrowUpRightIcon", {
  strokeWidth: 2.2,
  node: <path d="M7 17L17 7M8 7h9v9" />,
});

export const ArrowLeftIcon = makeIcon("ArrowLeftIcon", {
  strokeWidth: 2.2,
  node: <path d="M19 12H5M11 6l-6 6 6 6" />,
});

export const ChevronUpIcon = makeIcon("ChevronUpIcon", {
  strokeWidth: 2,
  node: <path d="M6 15l6-6 6 6" />,
});

/** Two horizontal slider bars ("More filters"). */
export const SlidersIcon = makeIcon("SlidersIcon", {
  node: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
});

/** Solid verified badge (company checkmark). */
export const VerifiedIcon = makeIcon("VerifiedIcon", {
  stroke: false,
  node: (
    <path
      fillRule="evenodd"
      d="M12 1.8l2.3 1.9 3-.1.9 2.9 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-.9 2.9-3-.1L12 22.2l-2.3-1.9-3 .1-.9-2.9-2.5-1.7.9-2.9-.9-2.9 2.5-1.7.9-2.9 3 .1zM10.7 15.6l5.2-5.2-1.3-1.3-3.9 3.9-1.6-1.6-1.3 1.3z"
    />
  ),
});

export const MicIcon = makeIcon("MicIcon", {
  node: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </>
  ),
});

/** Outline bookmark (unsaved state; `BookmarkIcon` is the solid saved state). */
export const BookmarkOutlineIcon = makeIcon("BookmarkOutlineIcon", {
  node: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1z" />,
});

/* ── Theme ───────────────────────────────────────────────────────────────────────── */

export const SunIcon = makeIcon("SunIcon", {
  strokeWidth: 1.6,
  node: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
    </>
  ),
});

export const MoonIcon = makeIcon("MoonIcon", {
  strokeWidth: 1.6,
  node: <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z" />,
});

/* ── Third-party brand marks (fixed colors) ──────────────────────────────────────── */

/** Apple logo — a solid brand glyph on `currentColor` (black on the auth tiles). */
export const AppleIcon = makeIcon("AppleIcon", {
  stroke: false,
  node: (
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
  ),
});

/** LinkedIn "in" square — a solid brand glyph on `currentColor` (colour it #0A66C2). */
export const LinkedInIcon = makeIcon("LinkedInIcon", {
  stroke: false,
  node: (
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  ),
});

/** Google "G" — official brand colors, so it ignores currentColor on purpose. */
export function GoogleIcon({ size = 18, className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={className} {...props}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

/** Microsoft four-square logo - official brand colors, so it ignores currentColor on purpose (the "Sign in with Microsoft" button). */
export function MicrosoftIcon({ size = 20, className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={className} {...props}>
      <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  );
}

/** Open book (guides / help center). */
export const BookOpenIcon = makeIcon("BookOpenIcon", {
  node: (
    <>
      <path d="M12 6.5C10.5 5 8 4.5 4 4.5v13c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-13c-4 0-6.5.5-8 2z" />
      <path d="M12 6.5v13" />
    </>
  ),
});

/** Lifebuoy (help & support). */
export const LifebuoyIcon = makeIcon("LifebuoyIcon", {
  node: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9" />
    </>
  ),
});

/** Counter-clockwise arrow (undo). */
export const UndoIcon = makeIcon("UndoIcon", {
  strokeWidth: 2,
  node: (
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
});

/** Two overlapping sheets (duplicate / copy). */
export const CopyIcon = makeIcon("CopyIcon", {
  node: (
    <>
      <rect x="9" y="9" width="11" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </>
  ),
});

/** Clockwise arrow (redo). */
export const RedoIcon = makeIcon("RedoIcon", {
  strokeWidth: 2,
  node: (
    <>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </>
  ),
});

/* ── Text formatting (the resume editor's mark toolbar) ───────────────────────────── */

export const BoldIcon = makeIcon("BoldIcon", {
  strokeWidth: 2.4,
  node: <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />,
});

export const ItalicIcon = makeIcon("ItalicIcon", {
  strokeWidth: 2.2,
  node: <path d="M10 5h8M6 19h8M15 5l-6 14" />,
});

export const UnderlineIcon = makeIcon("UnderlineIcon", {
  strokeWidth: 2.2,
  node: (
    <>
      <path d="M7 4v7a5 5 0 0 0 10 0V4" />
      <path d="M5 20h14" />
    </>
  ),
});

/** Numbered list (1. 2. 3.); the bulleted one is `ListIcon`. */
export const ListOrderedIcon = makeIcon("ListOrderedIcon", {
  node: (
    <>
      <path d="M11 6h9M11 12h9M11 18h9" />
      <path d="M4 5.2l1.4-.7V9M4 15.5a1.4 1.4 0 0 1 2.7.3c0 .8-.6 1.2-1.3 1.7L4 18.4h2.9" strokeWidth={1.5} />
    </>
  ),
});

/* ── Enterprise V2 kit (X2.15). BriefcaseIcon, ShieldCheckIcon and BuildingIcon already exist above. ── */
export const HandshakeIcon = makeIcon("HandshakeIcon", {
  node: (
    <>
      <path d="M2.5 11l3-3.5 4 1 3-1.5 3.5 1 3-1 3 4" />
      <path d="M2.5 11l2.5 2.5M5 13.5l3.5 3 2-1.5M8.5 16.5l2 1.5 2.5-1.5M13 16.5l2 1.5 3.5-3.5L21.5 11" />
      <path d="M9.5 8.5L12 12l3-2" />
    </>
  ),
});

export const CalendarCheckIcon = makeIcon("CalendarCheckIcon", {
  node: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="M9 15l2.2 2.2L15.5 13" />
    </>
  ),
});

export const ClipboardCheckIcon = makeIcon("ClipboardCheckIcon", {
  node: (
    <>
      <rect x="5" y="4.5" width="14" height="16.5" rx="2.2" />
      <path d="M9 4.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.5" />
      <path d="M9 13.2l2.2 2.2L15.2 11" />
    </>
  ),
});

export const RouteIcon = makeIcon("RouteIcon", {
  node: (
    <>
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" />
    </>
  ),
});

/** Picture frame with a sun and hills - the "your logo goes here" placeholder (tenant login logo slot, editor preview). */
export const ImageIcon = makeIcon("ImageIcon", {
  strokeWidth: 1.8,
  node: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M3.5 17.5l5-4.5 3.5 3 3-2.5 5.5 4.5" />
    </>
  ),
});

/* ── Solid tile glyphs (the Enterprise boards' KPI tiles and card headers draw filled icons) ───────────────────────── */

/** Two people, solid. */
export const UsersSolidIcon = makeIcon("UsersSolidIcon", {
  stroke: false,
  node: (
    <>
      <circle cx="9" cy="7.8" r="3.6" />
      <path d="M2.4 19.2c0-3.7 2.9-6 6.6-6s6.6 2.3 6.6 6c0 .9-.6 1.4-1.4 1.4H3.8c-.8 0-1.4-.5-1.4-1.4z" />
      <circle cx="17.2" cy="8.6" r="2.7" />
      <path d="M16.6 13.2c3 .1 4.9 1.9 4.9 4.9 0 .8-.5 1.3-1.2 1.3h-3.2c.3-.5.4-1 .4-1.6 0-1.8-.7-3.5-2-4.5.3-.1.7-.1 1.1-.1z" />
    </>
  ),
});

/** Three people (one in front, two behind), solid. */
export const TeamSolidIcon = makeIcon("TeamSolidIcon", {
  stroke: false,
  node: (
    <>
      <circle cx="12" cy="7.4" r="3.4" />
      <path d="M5.4 19.4c0-3.6 2.9-5.9 6.6-5.9s6.6 2.3 6.6 5.9c0 .9-.6 1.4-1.4 1.4H6.8c-.8 0-1.4-.5-1.4-1.4z" />
      <circle cx="4.6" cy="9.6" r="2.2" />
      <circle cx="19.4" cy="9.6" r="2.2" />
      <path d="M1 17.3c0-2.2 1.5-3.7 3.6-3.7.5 0 1 .1 1.5.3-1 1-1.6 2.4-1.7 4H2.1c-.6 0-1.1-.2-1.1-.6zM23 17.3c0-2.2-1.5-3.7-3.6-3.7-.5 0-1 .1-1.5.3 1 1 1.6 2.4 1.7 4h2.3c.6 0 1.1-.2 1.1-.6z" />
    </>
  ),
});

/** A document with text lines, solid. */
export const FileTextSolidIcon = makeIcon("FileTextSolidIcon", {
  stroke: false,
  node: <path fillRule="evenodd" d="M7 2.5h7.2l5.3 5.3V19a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 19V5A2.5 2.5 0 0 1 7 2.5zM8 7.7h4v1.6H8zm0 3.5h8v1.6H8zm0 3.4h8v1.6H8z" />,
});

/** A calendar with a date grid, solid. */
export const CalendarSolidIcon = makeIcon("CalendarSolidIcon", {
  stroke: false,
  node: (
    <path
      fillRule="evenodd"
      d="M7 2.5a1 1 0 0 1 1 1V5h8V3.5a1 1 0 1 1 2 0V5h.5A2.5 2.5 0 0 1 21 7.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-11A2.5 2.5 0 0 1 5.5 5H6V3.5a1 1 0 0 1 1-1zM7.5 10.5h2v2h-2zm3.5 0h2v2h-2zm3.5 0h2v2h-2zM7.5 14h2v2h-2zm3.5 0h2v2h-2zm3.5 0h2v2h-2z"
    />
  ),
});

/** A briefcase, solid. */
export const BriefcaseSolidIcon = makeIcon("BriefcaseSolidIcon", {
  stroke: false,
  node: (
    <>
      <path fillRule="evenodd" d="M9 4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6h3.5A2.5 2.5 0 0 1 21 8.5V12H3V8.5A2.5 2.5 0 0 1 5.5 6H9zm1.6 0V6h2.8V4.5z" />
      <path d="M3 13.4h6v1.2h6v-1.2h6v5.1a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5z" />
    </>
  ),
});

/** A stack of coins, solid. */
export const CoinsSolidIcon = makeIcon("CoinsSolidIcon", {
  stroke: false,
  node: (
    <>
      <ellipse cx="9.5" cy="6.2" rx="6.5" ry="3" />
      <path d="M3 9v2.2c0 1.7 2.9 3 6.5 3s6.5-1.3 6.5-3V9c-1.5 1.2-3.9 1.9-6.5 1.9S4.5 10.2 3 9z" />
      <path d="M3 14v2.2c0 1.7 2.9 3 6.5 3s6.5-1.3 6.5-3V14c-1.5 1.2-3.9 1.9-6.5 1.9S4.5 15.2 3 14z" />
      <path d="M17.5 9.6c2.1.2 3.5 1.1 3.5 2.3v2c0 1-1 1.8-2.5 2.2-.2-.5-.5-.9-.9-1.3 1-.3 1.5-.6 1.5-.9v-.6c-.6.4-1.5.7-2.4.8.1-.9.1-1.8-.2-2.5.4-.1.7-.3 1-.5zM17.9 15.2c1.6 0 3.1-.3 3.1-.3v1.9c0 1-1.5 1.8-3.2 2.1-.1-.8-.3-1.5-.7-2.2.3-.2.6-.5.8-.9z" />
    </>
  ),
});

/** A circle with two pause bars, solid. */
export const PauseCircleSolidIcon = makeIcon("PauseCircleSolidIcon", {
  stroke: false,
  node: <path fillRule="evenodd" d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zM9.6 8h1.8v8H9.6zm3 0h1.8v8h-1.8z" />,
});

/** A closed envelope, solid. */
export const MailSolidIcon = makeIcon("MailSolidIcon", {
  stroke: false,
  node: (
    <>
      <path d="M3 7.2A2.7 2.7 0 0 1 5.7 4.5h12.6A2.7 2.7 0 0 1 21 7.2v.2l-9 5.6-9-5.6z" />
      <path d="M3 9.7l8.4 5.2a1.2 1.2 0 0 0 1.2 0L21 9.7v7.1a2.7 2.7 0 0 1-2.7 2.7H5.7A2.7 2.7 0 0 1 3 16.8z" />
    </>
  ),
});

/** A lightning bolt, solid. */
export const BoltSolidIcon = makeIcon("BoltSolidIcon", {
  stroke: false,
  node: <path d="M13.6 1.8 4.4 13.4a.8.8 0 0 0 .6 1.3h5.2l-1.3 6.9a.5.5 0 0 0 .9.4l9-11.7a.8.8 0 0 0-.6-1.3h-5.1l1.2-6.9a.5.5 0 0 0-.7-.3z" />,
});

/** A bell, solid. */
export const BellSolidIcon = makeIcon("BellSolidIcon", {
  stroke: false,
  node: (
    <>
      <path d="M12 2.6a6.2 6.2 0 0 0-6.2 6.2v3.1c0 .9-.3 1.7-.9 2.4L3.6 16c-.7.8-.1 2 .9 2h15c1 0 1.6-1.2.9-2l-1.3-1.7a3.7 3.7 0 0 1-.9-2.4V8.8A6.2 6.2 0 0 0 12 2.6z" />
      <path d="M9.6 19.6a2.5 2.5 0 0 0 4.8 0z" />
    </>
  ),
});

/** Three bars of a bar chart, solid. */
export const BarChartSolidIcon = makeIcon("BarChartSolidIcon", {
  stroke: false,
  node: (
    <>
      <rect x="3.5" y="11" width="4.6" height="9.5" rx="1.3" />
      <rect x="9.7" y="4.5" width="4.6" height="16" rx="1.3" />
      <rect x="15.9" y="8" width="4.6" height="12.5" rx="1.3" />
    </>
  ),
});

/** A pie chart with a slice pulled out, solid. */
export const PieSolidIcon = makeIcon("PieSolidIcon", {
  stroke: false,
  node: (
    <>
      <path d="M11 3.2a9 9 0 1 0 9.8 9.8H11z" />
      <path d="M13.2 2.5v8.3h8.3A8.4 8.4 0 0 0 13.2 2.5z" />
    </>
  ),
});

/** A clock face, solid ring. */
export const ClockSolidIcon = makeIcon("ClockSolidIcon", {
  stroke: false,
  node: <path fillRule="evenodd" d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zm-.9 4.2h1.8v5l3.5 2.1-.9 1.5-4.4-2.7z" />,
});

/** A circle with a diagonal bar ("not allowed"), outline. */
export const BanIcon = makeIcon("BanIcon", {
  strokeWidth: 2.1,
  node: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M6 18 18 6" />
    </>
  ),
});
