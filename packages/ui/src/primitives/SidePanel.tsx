import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * SidePanel — the shell layout for a full-height side surface (the extension's review
 * panel, and reusable for any drawer): a sticky header (title + optional close), a
 * scrollable body, and an optional sticky footer for actions. Purely presentational —
 * open/close + focus live with the host.
 *
 * Fills its parent (expects the mount to be h-screen / 100%). Compose:
 *   <SidePanel title="Review resume" onClose={close} footer={<Actions/>}>…</SidePanel>
 */
export interface SidePanelProps {
  title?: ReactNode;
  /** When set, a close (×) button renders in the header. */
  onClose?: () => void;
  /** Sticky footer content (usually the primary/secondary actions). */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Extra content on the header's trailing side (before the close button). */
  headerAside?: ReactNode;
}

export default function SidePanel({
  title,
  onClose,
  footer,
  children,
  className,
  headerAside,
}: SidePanelProps) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-app-bg text-ink", className)}>
      {(title != null || onClose || headerAside) && (
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-paper px-4 py-3">
          {title != null && (
            <h2 className="min-w-0 flex-1 truncate font-display text-[15px] text-ink">{title}</h2>
          )}
          {headerAside}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-muted transition-colors hover:bg-paper-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </header>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>

      {footer != null && (
        <footer className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-line bg-paper px-4 py-3">
          {footer}
        </footer>
      )}
    </div>
  );
}
