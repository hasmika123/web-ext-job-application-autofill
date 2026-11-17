/**
 * Consultant surfaces (WP5c): the Jobs tab (jobs a marketer assigned to me) and the
 * "Assigned by <marketer>" chip shown when the page I'm on IS one of them.
 *
 * Both offer Open posting / I applied. The Jobs tab also lets the consultant answer the marketer (gap D11): Interested, Need info (a
 * question) and Decline (a reason), only where the server allows it (`allowedActions`). Applying is always the consultant's own act on
 * the site; "I applied" reports it. Nothing here fills, clicks or submits.
 */
import { useEffect, useState } from "react";
import { Badge, Button, Field, Select, Skeleton, Spinner, Textarea, useToast } from "@kiwiply/ui";
import { loadAssigned, markApplied, openPosting, respondJob, type AssignedJob } from "./workspace-actions";
const JAF = () => (window as any).JAF;

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

type Form = null | "request-info" | "decline";

/** Interested / Need info / Decline for one job (gap D11): the answers the server allows, and a small form for the two that need words. */
function JobResponses({ orgId, job, onUpdated }: { orgId: number; job: AssignedJob; onUpdated: (job: AssignedJob | null) => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Form>(null);
  const [question, setQuestion] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ws = JAF().workspace;
  const offered: { action: string; label: string }[] = ws.responsesFor(job);
  if (!offered.length) return null;

  async function send(action: "interest" | "request-info" | "decline", body = {}) {
    setBusy(true);
    setError("");
    const r = await respondJob(orgId, job, action, body);
    setBusy(false);
    if ("error" in r) return setError(r.error);
    setForm(null);
    toast({
      variant: "success",
      title: action === "interest" ? "Your marketer knows you're interested" : action === "decline" ? "Declined" : "Question sent to your marketer",
      description: job.title,
    });
    onUpdated(r.job);
  }

  return (
    <div className="flex flex-col gap-2" data-job-responses={job.id}>
      {!form && (
        <div className="flex flex-wrap gap-1.5">
          {offered.map((o) => (
            <Button
              key={o.action}
              size="sm"
              variant="ghost"
              disabled={busy}
              data-job-response={o.action}
              onClick={() => (o.action === "interest" ? void send("interest") : setForm(o.action as Form))}
            >
              {o.label}
            </Button>
          ))}
        </div>
      )}
      {form === "request-info" && (
        <div className="flex flex-col gap-2" data-job-form="request-info">
          <Field label="Your question for your marketer">
            <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} maxLength={ws.QUESTION_MAX} placeholder="e.g. Is this role open to remote work?" />
          </Field>
          <FormButtons busy={busy} label="Send question" onCancel={() => setForm(null)} onSend={() => void send("request-info", { question })} disabled={!question.trim()} />
        </div>
      )}
      {form === "decline" && (
        <div className="flex flex-col gap-2" data-job-form="decline">
          <Field label="Why not this one?">
            <Select value={reason} onChange={setReason} placeholder="Pick a reason" aria-label="Decline reason" options={ws.DECLINE_REASONS.map((r: { code: string; label: string }) => ({ value: r.code, label: r.label }))} />
          </Field>
          <Field label="Note (optional)">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={ws.DECLINE_NOTE_MAX} />
          </Field>
          <FormButtons busy={busy} label="Decline" onCancel={() => setForm(null)} onSend={() => void send("decline", { reason, note })} disabled={!reason} />
        </div>
      )}
      {error && (
        <p role="alert" className="text-[12px] font-medium text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

function FormButtons({ busy, label, disabled, onCancel, onSend }: { busy: boolean; label: string; disabled: boolean; onCancel: () => void; onSend: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button size="sm" variant="accent" onClick={onSend} disabled={busy || disabled}>
        {busy ? <Spinner className="h-3.5 w-3.5 text-on-accent" /> : null}
        {label}
      </Button>
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
          <JobResponses
            orgId={orgId}
            job={job}
            onUpdated={(next) => setJobs((all) => (all ? all.flatMap((j) => (j.id === job.id ? (next ? [next] : []) : [j])) : all))}
          />
        </div>
      ))}
    </div>
  );
}
