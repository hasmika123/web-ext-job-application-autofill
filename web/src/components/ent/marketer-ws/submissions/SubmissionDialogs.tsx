"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, Input, Select, Skeleton } from "@kiwiply/ui";
import {
  createSubmission, dateText, fetchOptions, fetchSubmission, shortDate,
  type SubmissionDetail, type SubmissionOptions, type SubmissionRow,
} from "@/lib/ent/marketer-ws/submissions";
import { ApprovalChip, StatusChip } from "./SubmissionParts";

/**
 * The three dialogs of the board. E1: "New Submission" creates a DRAFT record (nothing is sent to a client; the consultant approves and
 * submits), the detail dialog only reads, and the withdraw confirmation removes a draft from the board.
 */

export function NewSubmissionDialog({ orgId, open, onClose, onCreated }: { orgId: number; open: boolean; onClose: () => void; onCreated: (row: SubmissionRow) => void }) {
  const [options, setOptions] = useState<SubmissionOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [consultantId, setConsultantId] = useState("");
  const [jobId, setJobId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      setFailed(false);
      setError(null);
      setConsultantId("");
      setJobId("");
      setNote("");
      void fetchOptions(orgId, ctl.signal).then((o) => {
        if (ctl.signal.aborted) return;
        setOptions(o);
        setFailed(o === null);
        setLoading(false);
      });
    }, 0);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [open, orgId]);

  const submit = async () => {
    if (!consultantId || !jobId || saving) return;
    setSaving(true);
    setError(null);
    const r = await createSubmission(orgId, { consultantId: Number(consultantId), requirementId: Number(jobId), ...(note.trim() ? { note: note.trim() } : {}) });
    setSaving(false);
    if (r.ok) onCreated(r.data);
    else setError(r.error);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New Submission"
      description="Prepare a profile package for a job. This creates a draft record; nothing is sent to the client. Ask the consultant to approve it, then record what happens."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" size="sm" disabled={!consultantId || !jobId || saving} onClick={() => void submit()}>
            {saving ? "Creating…" : "Create draft"}
          </Button>
        </>
      }
    >
      {loading ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : failed || !options ? (
        <p className="text-[13.5px] text-muted">The consultants and jobs didn&apos;t load. Close this and try again.</p>
      ) : options.consultants.length === 0 ? (
        <p className="text-[13.5px] text-muted">No consultants are assigned to you yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink-soft">
            Consultant
            <Select
              aria-label="Consultant"
              placeholder="Choose a consultant"
              value={consultantId}
              onChange={setConsultantId}
              options={options.consultants.map((c) => ({ value: String(c.id), label: c.role ? `${c.name} - ${c.role}` : c.name }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink-soft">
            Job
            <Select
              aria-label="Job"
              placeholder={options.jobs.length ? "Choose an open job" : "No open jobs"}
              value={jobId}
              onChange={setJobId}
              options={options.jobs.map((j) => ({ value: String(j.id), label: `${j.title} - ${j.client} (${j.code})` }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink-soft">
            Note (optional)
            <Input aria-label="Note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this consultant fits" />
          </label>
        </div>
      )}
      {error ? (
        <p role="alert" data-form-error className="mt-3 text-[13px] font-semibold text-v2-danger-text">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

const EVENT_TEXT: Record<string, string> = {
  CREATED: "Draft prepared",
  APPROVAL_REQUESTED: "Sent for approval",
  APPROVAL_DECIDED: "Approval decision recorded",
  STATUS_RECORDED: "Status recorded",
  WITHDRAWN: "Draft withdrawn",
};
const pretty = (v: string | null) => (v ? v.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "");

export function SubmissionDetailDialog({ orgId, row, onClose }: { orgId: number; row: SubmissionRow | null; onClose: () => void }) {
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const id = row?.id ?? null;

  useEffect(() => {
    if (id === null) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setState("loading");
      setDetail(null);
      void fetchSubmission(orgId, id, ctl.signal).then((d) => {
        if (ctl.signal.aborted) return;
        setDetail(d);
        setState(d ? "ready" : "failed");
      });
    }, 0);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [orgId, id]);

  const r = detail?.row ?? row;
  return (
    <Dialog open={row !== null} onClose={onClose} title={r ? `${r.code} - ${r.consultant.name}` : "Submission"} footer={<Button variant="ghost" size="sm" onClick={onClose}>Close</Button>}>
      {r ? (
        <div data-submission-detail className="flex flex-col gap-3 text-[13.5px] text-ink-soft">
          <p>
            <b className="text-ink">{r.job.title}</b> ({r.job.code}) at {r.client.name}
          </p>
          <p className="flex flex-wrap items-center gap-2">
            <ApprovalChip state={r.approvalState} />
            <StatusChip status={r.status} />
            {r.resume ? <span>Resume {r.resume.version}{r.resume.updatedOn ? `, updated ${shortDate(r.resume.updatedOn)}` : ""}</span> : <span>No resume attached</span>}
          </p>
          {detail?.note ? <p>Note: {detail.note}</p> : null}
          {state === "loading" ? (
            <Skeleton className="h-16 w-full" />
          ) : state === "failed" ? (
            <p className="text-muted">The history didn&apos;t load.</p>
          ) : (
            <ol className="flex flex-col gap-1.5 border-t border-line pt-3" aria-label="History">
              {detail?.events.map((e) => (
                <li key={e.id} data-event-row={e.id} className="flex flex-wrap gap-x-2">
                  <span className="font-semibold text-ink">{EVENT_TEXT[e.kind] ?? pretty(e.kind)}</span>
                  {e.to ? <span>({pretty(e.from) ? `${pretty(e.from)} to ` : ""}{pretty(e.to)})</span> : null}
                  <span className="text-muted">{dateText(e.at)}</span>
                  {e.detail ? <span className="basis-full text-muted">{e.detail}</span> : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}

export function WithdrawDialog({ row, busy, onClose, onConfirm }: { row: SubmissionRow | null; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog
      open={row !== null}
      onClose={onClose}
      title="Withdraw this draft?"
      description={row ? `${row.consultant.name} - ${row.job.title} at ${row.client.name}. The record leaves the board; its history is kept. Nothing is sent to anyone.` : undefined}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="danger" size="sm" disabled={busy} onClick={onConfirm}>
            {busy ? "Withdrawing…" : "Withdraw draft"}
          </Button>
        </>
      }
    />
  );
}
