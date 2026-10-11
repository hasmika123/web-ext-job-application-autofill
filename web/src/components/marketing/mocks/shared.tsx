import type { ComponentType, ReactNode } from "react";
import { GoogleIcon, cn, type IconProps } from "@kiwiply/ui";
import { FAMILY, type Family } from "../family";

/**
 * Shared pieces for the pure-HTML product mocks (spec sections 4 and 13). Mocks show the board's
 * sample rows. Company marks are never real logo files: a coloured initial tile per company
 * (`GoogleIcon` for Google, four coloured squares for Microsoft). The frame is `role="img"` with a
 * label so assistive tech gets one description instead of a read-through of sample rows, and it is
 * mobile-safe (`max-w-full overflow-hidden`).
 */

/** White card with a title row (optional icon tile + right-hand action text). */
export function MockFrame({
  label,
  title,
  icon: Icon,
  iconFamily = "green",
  action,
  className,
  bodyClassName,
  children,
}: {
  /** Accessible description of what the mock shows. */
  label: string;
  /** Omit for a bare frame (the dashboard mock draws its own chrome). */
  title?: ReactNode;
  icon?: ComponentType<IconProps>;
  iconFamily?: Family;
  /** Small right-aligned text such as "View All". */
  action?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const f = FAMILY[iconFamily];
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "w-full min-w-0 max-w-full overflow-hidden rounded-[var(--radius-v2-card)] border border-v2-line/70 bg-white shadow-v2-float",
        className,
      )}
    >
      {title ? (
        <div className="flex items-center gap-3 px-4 pb-1 pt-4 sm:px-5 sm:pt-5">
          {Icon ? (
            <span aria-hidden className={cn("grid h-8 w-8 flex-none place-items-center rounded-lg", f.soft, f.icon)}>
              <Icon className="h-4 w-4" />
            </span>
          ) : null}
          <p className="min-w-0 flex-1 truncate text-[15px] font-bold text-v2-navy">{title}</p>
          {action ? <span className="hidden flex-none text-[12.5px] font-semibold text-v2-blue sm:block">{action}</span> : null}
        </div>
      ) : null}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </div>
  );
}

/** Soft coloured pill for a status ("Interview", "Applied"). */
export function StatusChip({
  family,
  children,
  className,
}: {
  family: Family;
  children: ReactNode;
  className?: string;
}) {
  const f = FAMILY[family];
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center rounded-full px-2.5 py-1 text-[11.5px] font-semibold leading-none",
        f.soft,
        f.deep,
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Letter tile in a soft family colour (avatars, generic marks). */
export function LetterTile({ letter, family, className }: { letter: string; family: Family; className?: string }) {
  const f = FAMILY[family];
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-9 w-9 flex-none place-items-center rounded-xl text-[14px] font-bold",
        f.soft,
        f.deep,
        className,
      )}
    >
      {letter}
    </span>
  );
}

const COMPANY_TILE = "grid h-10 w-10 flex-none place-items-center rounded-xl border border-v2-line/70 bg-white";

/**
 * Company initial tile for the board's sample rows. No real logo files: styled letters in each
 * brand's colour; Google uses the shared `GoogleIcon`, Microsoft four coloured squares.
 */
export function CompanyTile({ name, className }: { name: string; className?: string }) {
  switch (name) {
    case "Google":
      return (
        <span aria-hidden className={cn(COMPANY_TILE, className)}>
          <GoogleIcon size={22} />
        </span>
      );
    case "Microsoft":
      return (
        <span aria-hidden className={cn(COMPANY_TILE, className)}>
          <span className="grid grid-cols-2 gap-[2px]">
            <i className="block h-[9px] w-[9px] bg-[#F25022]" />
            <i className="block h-[9px] w-[9px] bg-[#7FBA00]" />
            <i className="block h-[9px] w-[9px] bg-[#00A4EF]" />
            <i className="block h-[9px] w-[9px] bg-[#FFB900]" />
          </span>
        </span>
      );
    case "Amazon":
      return (
        <span aria-hidden className={cn(COMPANY_TILE, className)}>
          <span className="border-b-[3px] border-[#FF9900] px-0.5 text-[20px] font-extrabold leading-[0.95] text-[#161D27]">
            a
          </span>
        </span>
      );
    case "Airbnb":
      return (
        <span aria-hidden className={cn(COMPANY_TILE, className)}>
          <span className="text-[21px] font-extrabold leading-none text-[#FF5A5F]">A</span>
        </span>
      );
    case "Netflix":
      return (
        <span aria-hidden className={cn(COMPANY_TILE, className)}>
          <span className="text-[21px] font-extrabold leading-none text-[#E50914]">N</span>
        </span>
      );
    case "Spotify":
      return (
        <span aria-hidden className={cn(COMPANY_TILE, "border-transparent bg-transparent", className)}>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#1DB954] text-[16px] font-extrabold text-white">
            S
          </span>
        </span>
      );
    case "Notion":
      return (
        <span aria-hidden className={cn(COMPANY_TILE, "border-[#161D27] bg-white", className)}>
          <span className="grid h-7 w-7 place-items-center rounded-md border-2 border-[#161D27] text-[15px] font-extrabold leading-none text-[#161D27]">
            N
          </span>
        </span>
      );
    default:
      return (
        <span aria-hidden className={cn(COMPANY_TILE, "text-[16px] font-extrabold text-v2-navy", className)}>
          {name[0]}
        </span>
      );
  }
}

/** Soft-tinted stat chip (value over label). */
export function StatChip({ label, value, family }: { label: string; value: string; family: Family }) {
  const f = FAMILY[family];
  return (
    <li className={cn("rounded-xl px-3 py-2.5 text-center", f.soft)}>
      <p className={cn("text-xl font-extrabold leading-none sm:text-2xl", f.deep)}>{value}</p>
      <p className="mt-1 truncate text-[11.5px] font-medium text-v2-ink-soft">{label}</p>
    </li>
  );
}
