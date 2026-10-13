import type { ReactNode } from "react";
import { cn } from "./cn";
import { MascotCheer } from "./doodles";

/**
 * EmptyState — the friendly "nothing here yet" panel (the page kit's honest empty state, APP-E2E-PLAN section 2.3):
 * say what is missing and offer ONE action; never a fake row.
 *
 *  - `variant="page"` (default): a centered dashed-border surface with an emoji/icon, title, copy, and an
 *    optional action. It IS the surface (dashed border) — don't nest it inside another Card. `mascot` adds the
 *    Kiwiply mascot above the title (page variant only).
 *  - `variant="inline"`: a compact line for an empty list *inside* a card or table body: no border, small type.
 */
export interface EmptyStateProps {
  /** `page` (default) is the full dashed panel; `inline` is the compact version for a card or table body. */
  variant?: "page" | "inline";
  /** Icon or emoji shown above the title (rendered at ~text-3xl; text-xl inline). */
  icon?: ReactNode;
  /** Show the mascot above the title. Page variant only; ignored inline. */
  mascot?: boolean;
  title: ReactNode;
  description?: ReactNode;
  /** Optional CTA (e.g. a Button). */
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({ variant = "page", icon, mascot = false, title, description, action, className }: EmptyStateProps) {
  if (variant === "inline") {
    return (
      <div data-empty-state="inline" className={cn("flex flex-col items-center justify-center px-4 py-6 text-center", className)}>
        {icon != null && <div className="mb-1.5 text-xl">{icon}</div>}
        <p className="text-sm font-semibold text-ink">{title}</p>
        {description != null && <p className="mt-1 max-w-xs text-[13px] text-muted">{description}</p>}
        {action != null && <div className="mt-3">{action}</div>}
      </div>
    );
  }
  return (
    <div
      data-empty-state="page"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        "border-2 border-dashed border-line rounded-[var(--radius-lg)] bg-paper",
        "px-6 py-12",
        className,
      )}
    >
      {mascot && <MascotCheer className="mb-3 h-20 w-20" />}
      {icon != null && <div className="mb-3 text-3xl">{icon}</div>}
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {description != null && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action != null && <div className="mt-5">{action}</div>}
    </div>
  );
}
