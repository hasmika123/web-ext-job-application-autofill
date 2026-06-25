import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ToastVariant = "default" | "success" | "error";

const ACCENT_BORDER: Record<ToastVariant, string> = {
  default: "border-l-line",
  success: "border-l-accent",
  error: "border-l-danger",
};

export interface ToastProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  variant?: ToastVariant;
  title?: ReactNode;
  /** Optional action element (e.g. an Undo button) shown on the right. */
  action?: ReactNode;
}

/**
 * Presentational toast surface (visual primitive). The queue/provider that mounts
 * and auto-dismisses these is built in R6.1; this is the styled building block.
 */
export default function Toast({
  variant = "default",
  title,
  action,
  className,
  children,
  ...props
}: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-3 bg-paper border border-line border-l-4 rounded-[var(--radius)]",
        "shadow-[var(--shadow-lg)] px-4 py-3 text-sm text-ink min-w-[260px] max-w-[92vw]",
        ACCENT_BORDER[variant],
        className,
      )}
      {...props}
    >
      <div className="flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-[13px] text-ink-soft">{children}</div>}
      </div>
      {action && <div className="flex-none">{action}</div>}
    </div>
  );
}
