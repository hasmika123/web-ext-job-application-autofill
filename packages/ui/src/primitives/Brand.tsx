import type { CSSProperties } from "react";
import { cn } from "./cn";

/**
 * Brand marks — ported from the web app's `ui/Logo` (the CSS reproduction, no next/image) so
 * the extension renders the exact kiwiply lockup: a brown disc + lime inner disc + charcoal
 * check, beside the two-tone serif wordmark. Token-driven → tracks light/dark.
 */
export interface MarkProps {
  /** Diameter in px. Default 26. */
  size?: number;
  className?: string;
}

/** Kiwi mark only (brown disc, lime inner disc, charcoal check). */
export function Mark({ size = 26, className }: MarkProps) {
  const inset = Math.max(3, Math.round(size * 0.155));
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-block flex-none rounded-full bg-brown shadow-[inset_0_0_0_1px_rgba(0,0,0,.06)]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <span className="absolute rounded-full bg-accent" style={{ inset } as CSSProperties} />
      <span
        className="absolute inset-0 grid place-items-center font-extrabold text-on-accent"
        style={{ fontSize: Math.round(size * 0.46) }}
      >
        ✓
      </span>
    </span>
  );
}

export interface WordmarkProps {
  /** Color of the "ply" half. Default charcoal ink; pass cream for dark surfaces. */
  plyColor?: string;
  className?: string;
}

/** Two-tone serif wordmark: green "kiwi" + "ply". Renders in the display (Fraunces) font. */
export function Wordmark({ plyColor = "var(--ink)", className }: WordmarkProps) {
  return (
    <span className={cn("font-display font-bold tracking-[-.01em] leading-none", className)}>
      <span className="text-accent">kiwi</span>
      <span style={{ color: plyColor }}>ply</span>
    </span>
  );
}

export interface BrandLockupProps {
  /** Mark diameter in px; the wordmark scales with it. Default 26. */
  size?: number;
  /** Color of the "ply" half. Default charcoal; pass cream for dark surfaces. */
  plyColor?: string;
  /** Wordmark font-size class (default text-[19px]). */
  wordClassName?: string;
  className?: string;
}

/** Kiwi mark + two-tone wordmark. */
export function BrandLockup({ size = 26, plyColor, wordClassName = "text-[19px]", className }: BrandLockupProps) {
  return (
    <span className={cn("inline-flex items-center gap-[9px]", className)}>
      <Mark size={size} />
      <Wordmark plyColor={plyColor} className={wordClassName} />
    </span>
  );
}

/** Small lime check chip (web `.Check`) — for trust lines / feature ticks. */
export function Check({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-4 w-4 flex-none place-items-center rounded-[5px] bg-accent text-[10px] font-bold text-on-accent",
        className,
      )}
    >
      ✓
    </span>
  );
}
