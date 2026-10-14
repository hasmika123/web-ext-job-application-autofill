"use client";

import { useEffect, useRef, useState } from "react";
import { Button, CalendarIcon, SideSheet, Skeleton, VideoIcon, cn } from "@kiwiply/ui";
import { Pill } from "./parts";
import {
  CHIP_LABELS,
  LIMITS,
  MODE_LABELS,
  OUTCOME_LABELS,
  checkDetailForm,
  checkFeedbackForm,
  dayText,
  detailFormOf,
  joinOffReason,
  joinUrl,
  recordFeedback,
  roleSubtitle,
  saveDetail,
  whenText,
  type DetailForm,
  type InterviewDetail,
  type Mode,
  type Outcome,
} from "@/lib/ent/consultant-ws/interviews";

/**
 * The interview side sheet: the interview at a glance, the consultant's own join details (mode, meeting link, interviewer title,
 * preparation note; only while the interview is scheduled) and, after it is completed, what they heard (outcome and a short summary).
 * It never creates, moves or cancels an interview. Every refusal from the API (including the sensitive-data one) is shown in words.
 */

const FIELD = "mt-1.5 w-full rounded-xl border border-line bg-paper px-3 text-[14px] text-ink outline-none focus-visible:border-accent";
const LABEL = "text-[13px] font-semibold text-ink";

export interface SheetState {
  id: number;
  focusNote?: boolean;
}

export default function InterviewSheet({
  open,
  orgId,
  state,
  detail,
  loading,
  onClose,
  onRetry,
  onSaved,
}: {
  open: boolean;
  orgId: number;
  state: SheetState | null;
  detail: InterviewDetail | null;
  loading: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSaved: (message: string, detail: InterviewDetail | null) => void;
}) {
  const row = detail?.interview ?? null;
  return (
    <SideSheet
      id="interview-sheet"
      side="right"
      mode="overlay"
      width={520}
      open={open}
      title={row ? row.title : "Interview"}
      description={row ? [row.company, row.round].filter(Boolean).join(" - ") || undefined : undefined}
      icon={<CalendarIcon size={20} />}
      onClose={onClose}
    >
      {loading ? (
        <div aria-busy="true" className="space-y-3 pt-2">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !detail || !row ? (
        <div className="py-8 text-center text-[13.5px] text-muted">
          <p>This interview didn&apos;t load. Nothing has changed.</p>
          <Button variant="ghost" size="sm" className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : (
        <div data-interview-sheet={row.id} className="space-y-5 pt-1">
          <Summary d={detail} />
          {detail.canEditDetails ? <DetailEditor key={`${row.id}-${row.mode}-${row.meetingUrl}-${row.interviewerTitle}-${row.prepNote}`} orgId={orgId} d={detail} focusNote={state?.focusNote === true} onClose={onClose} onSaved={onSaved} /> : null}
          {detail.canRecordFeedback ? <FeedbackEditor key={`fb-${row.id}-${detail.feedback?.updatedAt ?? "none"}`} orgId={orgId} d={detail} onClose={onClose} onSaved={onSaved} /> : null}
          {!detail.canEditDetails && !detail.canRecordFeedback ? <p className="rounded-xl border border-line p-3 text-[13px] text-muted">This interview was cancelled, so there is nothing to add.</p> : null}
        </div>
      )}
    </SideSheet>
  );
}

function Summary({ d }: { d: InterviewDetail }) {
  const r = d.interview;
  const when = whenText(r.scheduledAt, r.durationMinutes);
  const chip = r.chip ? CHIP_LABELS[r.chip] : null;
  const url = joinUrl(r);
  return (
    <section aria-label="Interview" className="rounded-xl border border-line p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        {chip ? <Pill tone={chip.tone}>{chip.label}</Pill> : <Pill tone={r.status === "COMPLETED" ? "green" : "slate"}>{r.status === "COMPLETED" ? "Completed" : "Cancelled"}</Pill>}
        {r.mode ? <Pill tone="slate">{MODE_LABELS[r.mode]}</Pill> : null}
        {d.applicationCode ? <span className="text-[12px] text-muted">Application {d.applicationCode}</span> : null}
      </div>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13.5px]">
        <dt className="text-muted">When</dt>
        <dd className="font-medium text-ink">
          {when.date}
          <span className="block font-normal text-ink-soft">{when.time}</span>
        </dd>
        <dt className="text-muted">Interviewer</dt>
        <dd className="font-medium text-ink">
          {r.interviewerName ?? "Not named yet"}
          {r.interviewerTitle ? <span className="block font-normal text-ink-soft">{r.interviewerTitle}</span> : null}
        </dd>
        {roleSubtitle(r) ? (
          <>
            <dt className="text-muted">Role</dt>
            <dd className="text-ink">{roleSubtitle(r)}</dd>
          </>
        ) : null}
      </dl>
      {r.status === "SCHEDULED" ? (
        url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Join ${r.title} interview (opens in a new tab)`} className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-4 text-[13.5px] font-semibold text-paper hover:bg-accent-deep">
            <VideoIcon size={15} />
            Join meeting
          </a>
        ) : (
          <p className="mt-3 text-[12.5px] text-muted">{joinOffReason(r)}</p>
        )
      ) : null}
    </section>
  );
}

function DetailEditor({ orgId, d, focusNote, onClose, onSaved }: { orgId: number; d: InterviewDetail; focusNote: boolean; onClose: () => void; onSaved: (m: string, d: InterviewDetail | null) => void }) {
  const [form, setForm] = useState<DetailForm>(() => detailFormOf(d.interview));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const note = useRef<HTMLTextAreaElement>(null);
  const id = d.interview.id;

  useEffect(() => {
    if (!focusNote) return;
    const t = setTimeout(() => note.current?.focus(), 260);
    return () => clearTimeout(t);
  }, [focusNote]);

  const save = async () => {
    const problem = checkDetailForm(form);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const r = await saveDetail(orgId, id, form);
    setBusy(false);
    if (!r.ok) return setError(r.message ?? "That didn't save. Nothing has changed.");
    onSaved("Interview details saved", r.detail ?? null);
  };

  return (
    <section aria-label="How you join" data-block="details" className="space-y-4">
      <h3 className="text-[15px] font-bold text-ink">How you join</h3>
      <div>
        <label htmlFor="iv-mode" className={LABEL}>
          Mode
        </label>
        <select id="iv-mode" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as Mode | "" })} className={cn(FIELD, "min-h-11")}>
          <option value="">Not set</option>
          {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
            <option key={m} value={m}>
              {MODE_LABELS[m]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="iv-url" className={LABEL}>
          Meeting link
        </label>
        <input id="iv-url" type="url" inputMode="url" autoComplete="off" placeholder="https://" value={form.meetingUrl} maxLength={LIMITS.url} onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })} className={cn(FIELD, "min-h-11")} />
        <p className="mt-1 text-[12px] text-muted">Only https links. Join opens it in a new tab.</p>
      </div>
      <div>
        <label htmlFor="iv-title" className={LABEL}>
          Interviewer&apos;s title
        </label>
        <input id="iv-title" value={form.interviewerTitle} maxLength={LIMITS.title} onChange={(e) => setForm({ ...form, interviewerTitle: e.target.value })} className={cn(FIELD, "min-h-11")} />
      </div>
      <div>
        <label htmlFor="iv-note" className={LABEL}>
          Preparation notes
        </label>
        <textarea id="iv-note" ref={note} rows={5} value={form.prepNote} maxLength={LIMITS.note} onChange={(e) => setForm({ ...form, prepNote: e.target.value })} className={cn(FIELD, "py-2")} />
        <p className="mt-1 text-[12px] text-muted">Private to you. Please don&apos;t add ID numbers or other personal identifiers.</p>
      </div>
      {error ? (
        <p role="alert" className="rounded-lg bg-v2-coral-soft px-3 py-2 text-[13px] text-v2-coral-ink">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Close
        </Button>
        <Button variant="accent" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving..." : "Save details"}
        </Button>
      </div>
    </section>
  );
}

function FeedbackEditor({ orgId, d, onClose, onSaved }: { orgId: number; d: InterviewDetail; onClose: () => void; onSaved: (m: string, d: InterviewDetail | null) => void }) {
  const existing = d.feedback;
  const [outcome, setOutcome] = useState<Outcome | "">(existing?.outcome ?? "");
  const [summary, setSummary] = useState(existing?.summary ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const problem = checkFeedbackForm(outcome, summary);
    if (problem || !outcome) return setError(problem);
    setBusy(true);
    setError(null);
    const r = await recordFeedback(orgId, d.interview.id, outcome, summary, existing !== null);
    setBusy(false);
    if (!r.ok) return setError(r.message ?? "That didn't save. Nothing has changed.");
    onSaved(existing ? "Feedback updated" : "Feedback saved", r.detail ?? null);
  };

  return (
    <section aria-label="Interview feedback" data-block="feedback" className="space-y-4">
      <h3 className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-ink">
        {existing ? "Your feedback" : "Add your feedback"}
        {existing ? <Pill tone={OUTCOME_LABELS[existing.outcome].tone}>{OUTCOME_LABELS[existing.outcome].label}</Pill> : null}
        {existing ? <span className="text-[12px] font-normal text-muted">{dayText(d.interview.scheduledAt)}</span> : null}
      </h3>
      <p className="-mt-2 text-[12.5px] text-muted">What did you hear after this interview? It stays private to you.</p>
      <fieldset>
        <legend className={LABEL}>How did it go?</legend>
        <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-label="Outcome">
          {(Object.keys(OUTCOME_LABELS) as Outcome[]).map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={outcome === o}
              onClick={() => setOutcome(o)}
              className={cn("inline-flex min-h-9 items-center rounded-lg border px-3.5 text-[13px] font-semibold", outcome === o ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-paper text-ink hover:bg-paper-2")}
            >
              {OUTCOME_LABELS[o].label}
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="iv-summary" className={LABEL}>
          Summary
        </label>
        <textarea id="iv-summary" rows={5} value={summary} maxLength={LIMITS.summary} onChange={(e) => setSummary(e.target.value)} className={cn(FIELD, "py-2")} />
        <p className="mt-1 text-[12px] text-muted">{summary.trim().length} / {LIMITS.summary}. Please don&apos;t add ID numbers or other personal identifiers.</p>
      </div>
      {error ? (
        <p role="alert" className="rounded-lg bg-v2-coral-soft px-3 py-2 text-[13px] text-v2-coral-ink">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Close
        </Button>
        <Button variant="accent" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving..." : existing ? "Update feedback" : "Save feedback"}
        </Button>
      </div>
    </section>
  );
}

