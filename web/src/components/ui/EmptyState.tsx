import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  /** Icon or emoji shown above the title. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Optional CTA (e.g. a Button or Link). */
  action?: ReactNode;
  className?: string;
}

/** Friendly empty state — centered, dashed surface (for empty lists/boards). */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        "border-2 border-dashed border-line rounded-[var(--radius-lg)] bg-paper",
        "px-6 py-12",
        className,
      )}
    >
      {icon && <div className="text-3xl mb-3">{icon}</div>}
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
