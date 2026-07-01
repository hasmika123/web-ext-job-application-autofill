import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * EmptyState — the centered "nothing here yet" panel: optional icon, a title, supporting
 * copy, and an optional action (usually a Button). Used for empty resume lists, no-results,
 * disconnected states, etc.
 */
export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-10 text-center", className)}>
      {icon != null && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-paper-2 text-muted">
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p className="font-display text-base text-ink">{title}</p>
        {description != null && (
          <p className="mx-auto max-w-[38ch] text-[13px] leading-relaxed text-muted">{description}</p>
        )}
      </div>
      {action != null && <div className="mt-1">{action}</div>}
    </div>
  );
}
