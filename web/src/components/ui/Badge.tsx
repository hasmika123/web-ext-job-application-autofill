import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type BadgeVariant = "ready" | "review" | "default";

const BADGE_BASE =
  "inline-flex items-center text-[10.5px] font-bold uppercase tracking-[.05em] " +
  "px-2 py-[3px] rounded-md";

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  ready: "bg-accent-soft text-accent-deep",
  // Brown = sparing "needs review" warm secondary.
  review: "bg-brown-soft text-brown-deep",
  default: "bg-ink text-paper",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

/** Small status badge (ported from the mockup `.badge`). */
export function Badge({ variant = "ready", className, ...props }: BadgeProps) {
  return <span className={cn(BADGE_BASE, BADGE_VARIANTS[variant], className)} {...props} />;
}

/** Rounded count/label pill (ported from the mockup `.pill`). */
export function Pill({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-block text-[11px] font-bold px-[9px] py-[3px] rounded-full bg-accent-soft text-accent-deep",
        className,
      )}
      {...props}
    />
  );
}

export default Badge;
