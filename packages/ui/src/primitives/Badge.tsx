import type { HTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * Badge / Pill / Tag — 1:1 with the web app's `ui/Badge` + `ui/Tag`, so the extension reads
 * as the same product.
 *
 *  - `Badge`  — small uppercase status chip (ready / review / default).
 *  - `Pill`   — rounded count/label pill (accent-soft).
 *  - `Tag`    — uppercase eyebrow for section labels.
 */
export type BadgeVariant = "ready" | "review" | "default";

const BADGE_BASE =
  "inline-flex items-center text-[10.5px] font-bold uppercase tracking-[.05em] px-2 py-[3px] rounded-md";

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  ready: "bg-accent-soft text-accent-deep",
  review: "bg-brown-soft text-brown-deep", // brown = sparing "needs review" warm secondary
  default: "bg-ink text-paper",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export default function Badge({ variant = "ready", className, ...props }: BadgeProps) {
  return <span className={cn(BADGE_BASE, BADGE_VARIANTS[variant], className)} {...props} />;
}

/** Rounded count/label pill (web `.pill`). */
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

/** Uppercase eyebrow tag (web `.tag`) — section labels / eyebrows. */
export function Tag({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[.1em] " +
          "text-accent-deep bg-accent-soft rounded-full px-3 py-[5px]",
        className,
      )}
      {...props}
    />
  );
}
