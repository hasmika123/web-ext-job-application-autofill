import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * EmptyState — the friendly "nothing here yet" panel, 1:1 with the web app's `ui/EmptyState`:
 * a centered dashed-border surface with an emoji/icon, title, copy, and an optional action.
 * It IS the surface (dashed border) — don't nest it inside another Card.
 */
export interface EmptyStateProps {
  /** Icon or emoji shown above the title (rendered at ~text-3xl). */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Optional CTA (e.g. a Button). */
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        "border-2 border-dashed border-line rounded-[var(--radius-lg)] bg-paper",
        "px-6 py-12",
        className,
      )}
    >
      {icon != null && <div className="mb-3 text-3xl">{icon}</div>}
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {description != null && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action != null && <div className="mt-5">{action}</div>}
    </div>
  );
}
