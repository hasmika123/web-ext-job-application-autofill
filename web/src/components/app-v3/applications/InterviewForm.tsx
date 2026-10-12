"use client";

import { useRef, useState } from "react";
import { CalendarIcon, DownloadIcon, ExternalLinkIcon, IconButton, Select, Tooltip, TrashIcon, buttonVariants, cn } from "@kiwiply/ui";
import { browserZone } from "@/lib/applications";
import { useAutosave } from "@/lib/autosave";
import { fromLocalInput, toLocalInput } from "@/lib/datetime-local";
import {
  INTERVIEW_KINDS,
  INTERVIEW_OUTCOMES,
  googleCalendarUrl,
  icsHref,
  interviewTitle,
  needsOutcome,
  setInterviewOutcome,
  updateInterview,
  type Interview,
  type InterviewInput,
  type InterviewKind,
  type InterviewOutcome,
} from "@/lib/interviews";
import { toAutosave } from "@/lib/tracker-client";
import AutosaveChip from "./AutosaveChip";
import { FIELD } from "./NextStepCard";

interface Form {
  kind: InterviewKind;
  startsAt: string;
  endsAt: string;
  location: string;
  interviewer: string;
  notes: string;
}

const toForm = (i: Interview): Form => ({
  kind: i.kind,
  startsAt: toLocalInput(i.startsAt),
  endsAt: toLocalInput(i.endsAt),
  location: i.location ?? "",
  interviewer: i.interviewer ?? "",
  notes: i.notes ?? "",
});

/** The fields of `a` that differ from `b`, as the PUT body (`null` clears an optional field). */
export function formPatch(a: Form, b: Form): Partial<InterviewInput> | "bad-start" {
  const patch: Partial<InterviewInput> = {};
  if (a.kind !== b.kind) patch.kind = a.kind;
  if (a.startsAt !== b.startsAt) {
    const iso = fromLocalInput(a.startsAt);
    if (!iso) return "bad-start";
    patch.startsAt = iso;
    const tz = browserZone();
    if (tz) patch.tz = tz;
  }
  if (a.endsAt !== b.endsAt) patch.endsAt = a.endsAt ? fromLocalInput(a.endsAt) : null;
  if (a.location !== b.location) patch.location = a.location.trim() || null;
  if (a.interviewer !== b.interviewer) patch.interviewer = a.interviewer.trim() || null;
  if (a.notes !== b.notes) patch.notes = a.notes.trim() || null;
  return patch;
}

const LOCATION_MAX = 200; // config-literal-ok: mirrors the API column size for the input's maxLength, not a tunable
const NOTES_MAX = 4000; // config-literal-ok: mirrors the API limit for the textarea's maxLength, not a tunable

/**
 * One interview, editable in place. Every field autosaves (`updateInterview`, only what changed), the chip says
 * where it stands, "Add to calendar" hands the event to Google Calendar or downloads an .ics, and once the
 * interview is over it asks "How did it go?" with one-tap outcome chips.
 */
export default function InterviewForm({
  interview,
  onChange,
  onDelete,
}: {
  interview: Interview;
  onChange(next: Interview): void;
  onDelete(): void;
}) {
  const [form, setForm] = useState<Form>(() => toForm(interview));
  const saved = useRef<Form>(form);
  const [outcome, setOutcome] = useState<InterviewOutcome>(interview.outcome);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);
  const [mountedAt] = useState(() => Date.now());
  const gone = useRef(false);

  const autosave = useAutosave<Form>(form, async (v) => {
    if (gone.current) return { kind: "ok" };
    const patch = formPatch(v, saved.current);
    if (patch === "bad-start") return { kind: "invalid", path: "startsAt", message: "Pick when the interview starts." };
    if (Object.keys(patch).length === 0) return { kind: "ok" };
    const r = await updateInterview(interview.applicationId, interview.id, patch);
    if (r.kind === "ok") {
      saved.current = v;
      onChange(r.data);
    }
    return toAutosave(r);
  });

  async function pickOutcome(next: InterviewOutcome) {
    const before = outcome;
    setOutcome(next);
    setOutcomeError(null);
    const r = await setInterviewOutcome(interview.applicationId, interview.id, next);
    if (r.kind === "ok") onChange(r.data);
    else {
      setOutcome(before);
      setOutcomeError(r.message);
    }
  }

  const current: Interview = { ...interview, outcome, kind: form.kind };
  const startIso = fromLocalInput(form.startsAt);
  const endIso = fromLocalInput(form.endsAt);
  const calendarable = !!startIso && autosave.status === "saved";
  const asked = startIso ? needsOutcome({ startsAt: startIso, endsAt: endIso, outcome }, new Date(mountedAt)) : false;
  const over = startIso ? new Date(endIso ?? startIso).getTime() < mountedAt : false;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const id = `iv-${interview.id}`;

  return (
    <div className="rounded-2xl border border-v2-line/70 bg-paper p-3.5 sm:p-4" data-interview-id={interview.id}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h4 className="flex items-center gap-2 font-display text-[15px] font-bold text-ink">
          <CalendarIcon aria-hidden className="h-4 w-4 text-v2-green" />
          {interviewTitle({ kind: form.kind, company: interview.company, roleTitle: interview.roleTitle })}
        </h4>
        <div className="flex items-center gap-1">
          <AutosaveChip autosave={autosave} />
          <Tooltip content="Delete interview">
            <IconButton
              aria-label="Delete interview"
              onClick={() => {
                gone.current = true;
                onDelete();
              }}
              className="h-10 w-10 sm:h-8 sm:w-8"
            >
              <TrashIcon aria-hidden className="h-4 w-4" />
            </IconButton>
          </Tooltip>
        </div>
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={`${id}-kind`} className="mb-1 block text-[12px] font-semibold text-v2-muted">
            Type
          </label>
          <Select
            id={`${id}-kind`}
            aria-label="Interview type"
            value={form.kind}
            onChange={(v) => set("kind", v as InterviewKind)}
            options={INTERVIEW_KINDS.map((k) => ({ value: k.value, label: k.label }))}
          />
        </div>
        <label className="block min-w-0">
          <span className="mb-1 block text-[12px] font-semibold text-v2-muted">Interviewer</span>
          <input type="text" value={form.interviewer} maxLength={120} placeholder="Who will you meet?" onChange={(e) => set("interviewer", e.target.value)} className={FIELD} />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-[12px] font-semibold text-v2-muted">Starts</span>
          <input type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} className={FIELD} />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-[12px] font-semibold text-v2-muted">Ends (optional)</span>
          <input type="datetime-local" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} className={FIELD} />
        </label>
        <label className="block min-w-0 sm:col-span-2">
          <span className="mb-1 block text-[12px] font-semibold text-v2-muted">Where or link</span>
          <input type="text" value={form.location} maxLength={LOCATION_MAX} placeholder="Office address or meeting link" onChange={(e) => set("location", e.target.value)} className={FIELD} />
        </label>
        <label className="block min-w-0 sm:col-span-2">
          <span className="mb-1 block text-[12px] font-semibold text-v2-muted">Prep notes</span>
          <textarea
            value={form.notes}
            maxLength={NOTES_MAX}
            rows={2}
            placeholder="Topics to review, questions to ask…"
            onChange={(e) => set("notes", e.target.value)}
            className="block w-full resize-y rounded-xl border border-v2-line bg-paper px-3 py-2 text-[14px] text-ink placeholder:text-v2-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          />
        </label>
      </div>

      {(over || outcome !== "PENDING") && (
        <div className="mt-3" data-outcome-block>
          <p className={cn("text-[13px] font-semibold", asked ? "text-v2-green-ink" : "text-ink-soft")}>{asked ? "How did it go?" : "Outcome"}</p>
          <div role="group" aria-label="Interview outcome" className="mt-1.5 flex flex-wrap gap-1.5">
            {INTERVIEW_OUTCOMES.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={outcome === o.value}
                onClick={() => {
                  if (outcome !== o.value) void pickOutcome(o.value);
                }}
                className={cn(
                  "inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] font-semibold transition-colors motion-safe:active:scale-95",
                  outcome === o.value ? "border-transparent bg-v2-green-soft text-v2-green-ink" : "border-v2-line bg-paper text-ink-soft hover:bg-paper-2",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          {outcomeError && (
            <p role="alert" className="mt-1.5 text-[12.5px] font-medium text-danger">
              {outcomeError}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-v2-line/60 pt-3">
        <span className="text-[12.5px] font-semibold text-v2-muted">Add to calendar</span>
        {calendarable ? (
          <>
            <a href={googleCalendarUrl(current)} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants("ghost", "sm"), "min-h-10 gap-1.5")}>
              <ExternalLinkIcon aria-hidden className="h-3.5 w-3.5" />
              Google Calendar
            </a>
            <a href={icsHref(interview.id)} download className={cn(buttonVariants("ghost", "sm"), "min-h-10 gap-1.5")}>
              <DownloadIcon aria-hidden className="h-3.5 w-3.5" />
              Download .ics
            </a>
          </>
        ) : (
          <span className="text-[12.5px] text-v2-muted">{startIso ? "Saving first…" : "Pick a start time"}</span>
        )}
      </div>
    </div>
  );
}
