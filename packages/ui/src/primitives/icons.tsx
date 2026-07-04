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
