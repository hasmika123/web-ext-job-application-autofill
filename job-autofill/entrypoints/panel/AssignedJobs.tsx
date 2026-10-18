/**
 * Consultant surfaces (WP5c): the Jobs tab (jobs a marketer assigned to me) and the
 * "Assigned by <marketer>" chip shown when the page I'm on IS one of them.
 *
 * Both only offer Open posting / I applied. Applying is always the consultant's own act on the
 * site; "I applied" reports it. Nothing here fills, clicks or submits.
 */
import { useEffect, useState } from "react";
import { Badge, Button, Skeleton, Spinner, useToast } from "@kiwiply/ui";
import { loadAssigned, markApplied, openPosting, type AssignedJob } from "./workspace-actions";

/* eslint-disable @typescript-eslint/no-explicit-any */
const MANUAL_COPY = "Press I applied after you submit.";

function useJobActions(orgId: number, onApplied?: (job: AssignedJob) => void) {
  const toast = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);
  async function applied(job: AssignedJob) {
    setBusyId(job.id);
    const ok = await markApplied(orgId, job);
    setBusyId(null);
    if (ok) {
      toast({ variant: "success", title: "Marked as applied", description: job.company ? `${job.title ?? "Job"} · ${job.company}` : job.title });
      onApplied?.(job);
    } else {
      toast({ variant: "error", title: "Couldn’t mark this as applied", description: "Check your connection and try again." });
    }
  }
  return { busyId, applied, open: (job: AssignedJob) => openPosting(orgId, job) };
}

function JobActions({ job, busy, onOpen, onApplied }: { job: AssignedJob; busy: boolean; onOpen: () => void; onApplied: () => void }) {
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="ghost" className="flex-1" disabled={!job.jobUrl} onClick={onOpen}>
        Open posting
      </Button>
      <Button size="sm" variant="accent" className="flex-1" disabled={busy} onClick={onApplied}>
        {busy ? <Spinner className="h-3.5 w-3.5 text-on-accent" /> : null}I applied
      </Button>
    </div>
  );
}

/** The chip on a page that matches an assigned job. */
export function AssignedChip({
  orgId,
  job,
  manualApplied,
  onApplied,
}: {
  orgId: number;
  job: AssignedJob;
  /** True where the extension can't detect a submit (LinkedIn, Dice, unknown sites). */
  manualApplied: boolean;
  onApplied?: (job: AssignedJob) => void;
}) {
  const { busyId, applied, open } = useJobActions(orgId, onApplied);
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-accent bg-accent-soft px-3.5 py-3">
      <div className="text-[12.5px] font-semibold text-accent-deep">Assigned by {job.assignedBy || "your marketer"}</div>
      {job.marketerNote && <p className="text-[12.5px] leading-snug text-ink">{job.marketerNote}</p>}
      {manualApplied && <p className="text-[12px] leading-snug text-ink-soft">{MANUAL_COPY}</p>}
      <JobActions job={job} busy={busyId === job.id} onOpen={() => open(job)} onApplied={() => applied(job)} />
    </div>
  );
}

/** The Jobs tab. */
export function AssignedJobsList({ orgId, orgName }: { orgId: number; orgName: string }) {
  const [jobs, setJobs] = useState<AssignedJob[] | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const { busyId, applied, open } = useJobActions(orgId, (job) => setJobs((all) => (all ? all.filter((j) => j.id !== job.id) : all)));

  useEffect(() => {
    let alive = true;
    setJobs(null);
    setError("");
    loadAssigned(orgId)
      .then((r) => {
        if (!alive) return;
        if (!r) return setError("Connect the extension on kiwiply.com first.");
        setJobs(r.items);
        setStale(r.stale);
      })
      .catch(() => alive && setError("Couldn’t load your assigned jobs."));
    return () => {
      alive = false;
    };
  }, [orgId]);

  if (error) return <p role="alert" className="text-[12.5px] font-medium text-danger-text">{error}</p>;
  if (!jobs) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading assigned jobs">
        <Skeleton className="h-24 w-full rounded-[var(--radius)]" />
        <Skeleton className="h-24 w-full rounded-[var(--radius)]" />
      </div>
    );
  }
  if (!jobs.length) return <p className="text-[12.5px] leading-snug text-muted">No jobs assigned to you in {orgName} right now.</p>;

  return (
    <div className="flex flex-col gap-2.5">
      {stale && <p className="text-[11.5px] text-muted">Showing your last saved list — couldn’t refresh.</p>}
      {jobs.map((job) => (
        <div key={job.id} className="flex flex-col gap-2 rounded-[var(--radius)] border border-line bg-paper p-3">
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold text-ink" title={job.title}>
              {job.title || "Untitled job"}
            </div>
            <div className="truncate text-[12px] text-ink-soft">
              {[job.company, job.location].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={job.state === "ASSIGNED" ? "ready" : "review"}>{job.state.replace("_", " ")}</Badge>
            {job.priority === "HIGH" && <Badge variant="default">High</Badge>}
            {job.dueOn && <span className="text-[11.5px] text-muted">Due {job.dueOn}</span>}
            <span className="text-[11.5px] text-muted">from {job.assignedBy || "your marketer"}</span>
          </div>
          {job.marketerNote && <p className="text-[12px] leading-snug text-ink-soft">{job.marketerNote}</p>}
          <JobActions job={job} busy={busyId === job.id} onOpen={() => open(job)} onApplied={() => applied(job)} />
        </div>
      ))}
    </div>
  );
}
