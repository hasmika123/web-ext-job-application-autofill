import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";
import { FAMILY, type Family } from "../family";

/**
 * Shared pieces for the pure-HTML product mocks (spec section 4). Every mock is clearly
 * fictional, carries an "Example" badge, never uses a real company logo, and is mobile-safe
 * (`max-w-full overflow-hidden`). The frame is `role="img"` with a label so assistive tech gets
 * one honest description instead of a read-through of made-up rows.
 */

/** Tiny "Example" tag so no sample number is mistaken for a result. */
export function ExampleBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center rounded-full border border-v2-line bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-v2-muted",
        className,
      )}
    >
      Example
    </span>
  );
}

/** White card with a title row + Example badge. */
export function MockFrame({
  label,
  title,
  className,
  bodyClassName,
  children,
}: {
  /** Accessible description of what the mock shows. */
  label: string;
  title: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "w-full min-w-0 max-w-full overflow-hidden rounded-[var(--radius-v2-card)] border border-v2-line/70 bg-white shadow-v2-float",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-v2-line/70 px-4 py-3 sm:px-5">
        <p className="min-w-0 truncate text-[15px] font-bold text-v2-navy">{title}</p>
        <ExampleBadge />
      </div>
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

/** Letter tile standing in for a company logo (we never show real logos). */
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

/** Soft-tinted stat chip (value over label). */
export function StatChip({ label, value, family }: { label: string; value: string; family: Family }) {
  const f = FAMILY[family];
  return (
    <li className={cn("rounded-xl px-3 py-2.5", f.soft)}>
      <p className={cn("text-xl font-extrabold leading-none sm:text-2xl", f.deep)}>{value}</p>
      <p className="mt-1 truncate text-[11.5px] font-medium text-v2-ink-soft">{label}</p>
    </li>
  );
}
