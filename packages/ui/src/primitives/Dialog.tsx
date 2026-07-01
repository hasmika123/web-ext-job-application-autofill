import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Dialog — a modal built dependency-free: a scrim + centered panel with `role="dialog"`,
 * `aria-modal`, Escape-to-close, backdrop-click-to-close, a focus trap, and focus
 * restoration to the trigger on close. Body scroll is locked while open. Rendered inline
 * with `position: fixed` (no portal) so it works in the extension surfaces too.
 *
 *   <Dialog open={open} onClose={close} title="Report a bug">…</Dialog>
 */
export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  /** Sticky footer actions. */
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Disable closing on backdrop click / Escape (e.g. a required choice). */
  dismissable?: boolean;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  className,
  dismissable = true,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const requestClose = useCallback(() => {
    if (dismissable) onClose();
  }, [dismissable, onClose]);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    // Focus the first focusable control, else the panel itself.
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && (activeEl === firstEl || activeEl === panel)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && activeEl === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, requestClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_55%,transparent)]" aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={cn(
          "relative z-10 flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col overflow-hidden " +
            "rounded-[var(--radius-lg)] bg-paper text-ink shadow-[var(--shadow-lg)] outline-none",
          className,
        )}
      >
        {(title != null || description != null) && (
          <div className="flex items-start gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              {title != null && <h2 className="font-display text-lg text-ink">{title}</h2>}
              {description != null && (
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>
              )}
            </div>
            {dismissable && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted transition-colors hover:bg-paper-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer != null && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
