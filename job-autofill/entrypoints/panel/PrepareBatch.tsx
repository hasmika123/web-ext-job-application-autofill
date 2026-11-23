/**
 * Batch overview for "Prepare selected openings" (X12.9): n jobs — waiting / filled / needs input /
 * submitted — with "Open next" and "Stop batch". Shown to a consultant account only, while a batch
 * exists. The consultant reviews, completes and submits on each real site; this card never fills,
 * clicks or submits anything.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, useToast } from "@kiwiply/ui";
import { dismissBatch, focusJob, openNext, readBatch, stopBatch, watchBatch, type BatchAnswer, type BatchJob, type BatchStatus } from "./prepare-actions";

const STATE_LABEL: Record<BatchJob["state"], string> = {
  QUEUED: "Queued",
  OPENED: "Waiting",
  PREFILLED: "Filled",
  NEEDS_INPUT: "Needs input",
  SUBMIT_DETECTED: "Submitted",
  CLOSED: "Closed",
  FAILED: "Failed",
};

function variantOf(state: BatchJob["state"]): "ready" | "review" | "default" {
  if (state === "PREFILLED" || state === "SUBMIT_DETECTED") return "ready";
  if (state === "NEEDS_INPUT" || state === "FAILED") return "review";
  return "default";
}

function answerMark(status: BatchAnswer["status"]): string {
  return status === "ok" ? "✓" : status === "failed" ? "!" : "–";
}

export function PrepareBatch() {
  const toast = useToast();
  const [batch, setBatch] = useState<BatchStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    readBatch().then(setBatch);
  }, []);
  useEffect(() => {
    refresh();
    return watchBatch(refresh);
  }, [refresh]);

  if (!batch) return null;
  const c = batch.counts;

  async function onOpenNext() {
    setBusy(true);
    const r = await openNext();
    setBusy(false);
    if (r && !r.ok) {
      toast({
        variant: "error",
        title: r.reason === "at-capacity" ? "Five tabs are already open" : "Nothing left to open",
        description: r.reason === "at-capacity" ? "Finish or close one of them first." : undefined,
      });
    }
    refresh();
  }
  async function onStop() {
    setBusy(true);
    await stopBatch();
    setBusy(false);
    refresh();
  }
  async function onFocus(matchId: number | string) {
    setBusy(true);
    const r = await focusJob(matchId);
    setBusy(false);
    if (r && !r.ok) {
      toast({
        variant: "error",
        title: r.reason === "tab-closed" ? "Application tab is closed" : "Could not open that application tab",
        description: r.reason === "tab-closed" ? "Open the job again from the batch or continue with another job." : undefined,
      });
      refresh();
    }
  }
  async function onDismiss() {
    await dismissBatch();
    setBatch(null);
  }

  const running = !batch.stopped && !batch.done;
  return (
    <section aria-label="Prepare batch" className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] border border-accent bg-accent-soft px-3.5 py-3">
      <div className="text-[12.5px] font-semibold text-accent-deep">
        {batch.stopped ? "Batch stopped" : batch.done ? "Batch finished" : "Preparing your selected openings"}
      </div>
      <p className="text-[12px] leading-snug text-ink">
        Prepared by Kiwiply: review every field. Nothing is submitted for you.
      </p>
      <p className="text-[12px] leading-snug text-ink-soft" aria-live="polite">
        {c.total} job{c.total === 1 ? "" : "s"}: {c.waiting} waiting · {c.filled} filled · {c.needsInput} need input · {c.submitted} submitted
        {c.failed ? ` · ${c.failed} failed` : ""}
      </p>
      <ul className="flex flex-col gap-1.5">
        {batch.jobs.map((j) => (
          <li key={String(j.matchId)} className="rounded-[var(--radius)] border border-line bg-paper px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[12.5px] font-semibold text-ink" title={j.title}>
                {j.title || "Untitled job"}
                {j.company ? <span className="font-normal text-ink-soft"> · {j.company}</span> : null}
              </span>
              <Badge variant={variantOf(j.state)}>{STATE_LABEL[j.state]}</Badge>
            </div>
            {(j.reason || j.help) && (
              <p className="mt-1 text-[11.5px] leading-snug text-muted">
                {j.reason}
                {j.help ? ` — ${j.help}` : ""}
              </p>
            )}
            {j.missingCount > 0 && (
              <p className="mt-1 text-[11.5px] leading-snug text-accent-deep">
                {j.missingCount} required field{j.missingCount === 1 ? "" : "s"} still need your input
              </p>
            )}
            {j.state === "CLOSED" && (
              <p className="mt-1 text-[11.5px] leading-snug text-muted">
                Application tab closed — reopen the posting to continue.
              </p>
            )}
            {j.review && (
              <div className="mt-2 rounded-[var(--radius)] border border-line bg-paper-2 px-2 py-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Filled answers{j.review.steps > 1 ? ` · ${j.review.steps} steps` : ""}
                </p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {j.review.answers.map((a, i) => (
                    <li key={`${a.label}-${i}`} className="grid grid-cols-[14px_minmax(0,1fr)] gap-1 text-[11.5px] leading-snug">
                      <span aria-label={a.status}>{answerMark(a.status)}</span>
                      <span className="min-w-0 break-words">
                        <span className="font-medium text-ink-soft">{a.label}:</span>{" "}
                        <span className="text-ink">{a.value || "(blank)"}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {j.review.fileName && (
                  <p className="mt-1 text-[11.5px] leading-snug text-ink-soft">
                    Résumé: <span className="text-ink">{j.review.fileName}</span>{j.review.fileStatus !== "ok" ? " · attach manually" : ""}
                  </p>
                )}
                {j.review.missing.length > 0 && (
                  <div className="mt-1.5">
                    <p className="text-[11.5px] font-semibold text-accent-deep">Still needs you</p>
                    <ul className="mt-0.5 list-disc pl-4 text-[11.5px] leading-snug text-accent-deep">
                      {j.review.missing.map((name, i) => <li key={`${name}-${i}`}>{name}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {j.tabOpen && (
              <Button
                size="sm"
                variant="ghost"
                className="mt-1"
                disabled={busy}
                onClick={() => onFocus(j.matchId)}
                aria-label={`Go to ${j.title || "application"}`}
              >
                Go to tab
              </Button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        {running && (
          <Button size="sm" variant="ghost" className="flex-1" disabled={busy || c.queued === 0} onClick={onOpenNext}>
            Open next
          </Button>
        )}
        {running ? (
          <Button size="sm" variant="ghost" className="flex-1" disabled={busy} onClick={onStop}>
            Stop batch
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="flex-1" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>
    </section>
  );
}
