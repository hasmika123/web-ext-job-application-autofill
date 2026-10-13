import type { ReactNode } from "react";
import { AlertIcon } from "./icons";
import { cn } from "./cn";

/**
 * ErrorState — "Couldn't load X · Retry" (the page kit, E2E-U0.0). One calm line and one action: a failed load is
 * never a blank page and never a stack trace. When the server sent a request id it is shown small, so a user can
 * quote it to support.
 *
 *   <ErrorState what="your applications" requestId={err.requestId} onRetry={refetch} />
 */
export interface ErrorStateProps {
  /** What failed to load, lower-case and without a verb: "your applications". */
  what: string;
  /** Overrides the default title "Couldn't load {what}". */
  title?: ReactNode;
  /** One short, human reason when there is one ("You're offline."). */
  description?: ReactNode;
  /** The `x-request-id` the server answered with. */
  requestId?: string | null;
  /** Shows the Retry button when given. */
  onRetry?: () => void;
  /** `page` is the dashed panel; `inline` fits inside a card. */
  variant?: "page" | "inline";
  className?: string;
}

export default function ErrorState({ what, title, description, requestId, onRetry, variant = "page", className }: ErrorStateProps) {
  const inline = variant === "inline";
  return (
    <div
      role="alert"
      data-error-state={variant}
      className={cn(
        "flex flex-col items-center justify-center text-center",
        inline ? "px-4 py-6" : "rounded-[var(--radius-lg)] border-2 border-dashed border-line bg-paper px-6 py-12",
        className,
      )}
    >
      <AlertIcon aria-hidden className={cn("mb-2 text-danger", inline ? "h-5 w-5" : "h-7 w-7")} />
      <p className={cn("font-semibold text-ink", inline ? "text-sm" : "text-lg")}>{title ?? `Couldn't load ${what}`}</p>
      {description != null && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex min-h-11 items-center rounded-full border border-line bg-paper px-4 text-sm font-semibold text-ink transition-colors hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-9"
        >
          Retry
        </button>
      )}
      {requestId && <p className="mt-2 text-xs text-muted">Request id: {requestId}</p>}
    </div>
  );
}
