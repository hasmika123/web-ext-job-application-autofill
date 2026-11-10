/**
 * Batch overview for "Prepare selected openings" (X12.9): n jobs — waiting / filled / needs input /
 * submitted — with "Open next" and "Stop batch". Shown to a consultant account only, while a batch
 * exists. The consultant reviews, completes and submits on each real site; this card never fills,
 * clicks or submits anything.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, useToast } from "@kiwiply/ui";
import { dismissBatch, openNext, readBatch, stopBatch, watchBatch, type BatchJob, type BatchStatus } from "./prepare-actions";

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
