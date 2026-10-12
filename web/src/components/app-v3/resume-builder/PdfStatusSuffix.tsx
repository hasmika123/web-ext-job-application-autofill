"use client";

import { FileTextIcon, cn } from "@kiwiply/ui";
import { pdfIsUpdating, type PdfInfo } from "@/lib/resume-doc";

/**
 * The muted suffix after the save status in the editor's top bar (Resume Builder R3.7, DESIGN 8.5):
 *   PENDING / RUNNING / STALE -> "· PDF updating…" (document icon)
 *   FAILED                    -> "· PDF couldn't be made · Retry" (Retry asks for the PDF right now)
 *   NONE / READY              -> nothing
 * The save status stays the primary message; this only says the stored file (what the extension attaches)
 * is catching up or needs a nudge.
 */
export default function PdfStatusSuffix({ pdf, onRetry, className }: { pdf: PdfInfo | null | undefined; onRetry?: () => void; className?: string }) {
  const status = pdf?.status;
  if (pdfIsUpdating(status)) {
    return (
      <span
        role="status"
        aria-live="polite"
        data-pdf-status="updating"
        className={cn("inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-soft", className)}
      >
        <span aria-hidden>·</span>
        <FileTextIcon aria-hidden className="h-3.5 w-3.5" />
        <span>PDF updating…</span>
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span role="status" aria-live="polite" data-pdf-status="failed" className={cn("inline-flex items-center gap-1 text-[12.5px] font-medium text-danger", className)}>
        <span aria-hidden>·</span>
        <span>PDF couldn&apos;t be made</span>
        {onRetry && (
          <>
            <span aria-hidden>·</span>
            <button
              type="button"
              onClick={onRetry}
              className="min-h-11 cursor-pointer rounded px-1 font-semibold underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-0"
            >
              Retry
            </button>
          </>
        )}
      </span>
    );
  }
  return null;
}
