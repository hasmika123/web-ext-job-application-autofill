"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the pickers start a search when the text changes and store the answer; the dialogs reset when they open */

import { useEffect, useRef, useState } from "react";
import { Button, Dialog, Field, Input, Select, Textarea, XIcon } from "@kiwiply/ui";
import {
  errorSentence,
  interviewsApi,
  MODES,
  MODE_LABEL,
  newKey,
  RECOMMENDATIONS,
  RECOMMENDATION_LABEL,
  type InterviewDetail,
  type InterviewerInput,
  type Mode,
  type PickerItem,
  type Recommendation,
} from "@/lib/ent/interviews";

const SEARCH_DELAY_MS = 250; // config-literal-ok: how long typing rests before the picker asks the server (UI timing)
export const DURATIONS = [30, 45, 60, 90]; // config-literal-ok: the quick choices of the length list; the organization's maximum is enforced by the API

/** `yyyy-mm-dd` + `hh:mm` to the instant the API takes (the page shows and takes UTC, like every other enterprise page). */
export function toInstant(date: string, time: string): string {
  return `${date}T${time}:00Z`;
}

const TZ_HINT = "Times are in UTC.";

/** A search box that lists up to 20 matches from the API; choosing one shows it as a chip with a clear button. */
function SearchPicker({
  label,
  placeholder,
  value,
  onChange,
  load,
  reloadKey,
}: {
  label: string;
  placeholder: string;
  value: PickerItem | null;
  onChange: (v: PickerItem | null) => void;
  load: (q: string) => Promise<PickerItem[] | null>;
  /** Changes when the list should be asked again with the same text (a different consultant). */
  reloadKey?: string | number;
}) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<PickerItem[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [open, setOpen] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    setState("loading");
    const t = setTimeout(() => {
      void load(text.trim()).then((r) => {
        if (mine !== seq.current) return;
        if (r) {
          setItems(r);
          setState("idle");
        } else setState("error");
      });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(t);
    // `load` is a fresh closure on every render; the text, the open state and the reload key are what matter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, open, reloadKey]);

  if (value) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-2 rounded-[var(--radius)] border border-line bg-paper-2/50 px-3 py-1.5 text-[13.5px]" data-picked={label}>
        <span className="min-w-0 truncate">
          <span className="font-semibold text-ink">{value.label}</span>
          {value.sub && <span className="text-muted"> · {value.sub}</span>}
        </span>
        <button type="button" aria-label={`Change ${label.toLowerCase()}`} onClick={() => onChange(null)} className="grid h-7 w-7 flex-none place-items-center rounded-full hover:bg-paper-2">
          <XIcon size={14} aria-hidden />
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        autoComplete="off"
      />
      {open && (
        <ul role="listbox" aria-label={`${label} results`} className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-[var(--radius)] border border-line bg-paper shadow-lg">
          {state === "loading" && <li className="px-3 py-2 text-[13px] text-muted">Searching…</li>}
          {state === "error" && <li className="px-3 py-2 text-[13px] text-danger">Couldn&apos;t load the list. Try again.</li>}
          {state === "idle" && items.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">No matches.</li>}
          {state === "idle" &&
            items.map((it) => (
              <li key={it.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(it);
                    setOpen(false);
                    setText("");
                  }}
                  className="flex min-h-11 w-full flex-col items-start px-3 py-1.5 text-left hover:bg-accent-soft focus-visible:bg-accent-soft"
                >
                  <span className="text-[13.5px] font-semibold text-ink">{it.label}</span>
                  {it.sub && <span className="text-[12px] text-muted">{it.sub}</span>}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Schedule Interview: records that an interview is arranged for a consultant. It adds a row; it does not invite anyone or book anything.
 * The application is optional: without one the client is picked instead.
 */
export function ScheduleDialog({
  open,
  onClose,
  orgId,
  onCreated,
  maxInterviewers,
}: {
  open: boolean;
  onClose: () => void;
  orgId: number | string;
  onCreated: (d: InterviewDetail) => void;
  maxInterviewers: number;
}) {
  const [consultant, setConsultant] = useState<PickerItem | null>(null);
  const [application, setApplication] = useState<PickerItem | null>(null);
  const [client, setClient] = useState<PickerItem | null>(null);
  const [round, setRound] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("45");
  const [mode, setMode] = useState<Mode>("VIDEO");
  const [link, setLink] = useState("");
  const [location, setLocation] = useState("");
  const [people, setPeople] = useState<InterviewerInput[]>([{ name: "", title: "", primary: true }]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = useRef(newKey());

  useEffect(() => {
    if (!open) return;
    key.current = newKey();
    setConsultant(null);
    setApplication(null);
    setClient(null);
    setRound("");
    setDate("");
    setTime("10:00");
    setDuration("45");
    setMode("VIDEO");
    setLink("");
    setLocation("");
    setPeople([{ name: "", title: "", primary: true }]);
    setNotes("");
    setErr(null);
  }, [open]);

  const ready = !!consultant && !!date && !!time && (!!application || !!client) && !busy;

  async function submit() {
    if (!ready || !consultant) return;
    setBusy(true);
    setErr(null);
    const named = people.filter((p) => p.name.trim());
    const r = await interviewsApi.create(
      orgId,
      {
        consultantId: consultant.id,
        applicationId: application?.id ?? null,
        clientId: application ? null : (client?.id ?? null),
        round: round.trim() || null,
        scheduledAt: toInstant(date, time),
        durationMinutes: Number(duration),
        mode,
        meetingLink: mode === "VIDEO" ? link.trim() || null : null,
        location: mode === "ONSITE" ? location.trim() || null : null,
        notes: notes.trim() || null,
        interviewers: named.map((p, i) => ({ name: p.name.trim(), title: p.title?.trim() || null, primary: i === 0 })),
      },
      key.current,
    );
    setBusy(false);
    if (!r.ok) {
      setErr(errorSentence(r));
      return;
    }
    onCreated(r.data);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Schedule Interview"
      description="Record an interview that is arranged for a consultant. This adds it to your board; it doesn't invite or book anyone."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!ready} data-schedule-submit>
            Schedule interview
          </Button>
        </>
      }
    >
      <div className="space-y-3.5" data-schedule-dialog>
        <Field label="Consultant" required>
          <SearchPicker
            label="Consultant"
            placeholder="Search consultants"
            value={consultant}
            onChange={(c) => {
              setConsultant(c);
              setApplication(null);
            }}
            load={async (q) => {
              const r = await interviewsApi.pickers(orgId, "consultant", q);
              return r.ok ? r.data.items : null;
            }}
          />
        </Field>
        {consultant && (
          <Field label="Application" hint="Pick the application this interview belongs to, or choose a client below.">
            <SearchPicker
              label="Application"
              placeholder="Search their open applications"
              value={application}
              onChange={setApplication}
              reloadKey={consultant.id}
              load={async (q) => {
                const r = await interviewsApi.pickers(orgId, "application", q, consultant.id);
                return r.ok ? r.data.items : null;
              }}
            />
          </Field>
        )}
        {consultant && !application && (
          <Field label="Client" required>
            <SearchPicker
              label="Client"
              placeholder="Search clients"
              value={client}
              onChange={setClient}
              load={async (q) => {
                const r = await interviewsApi.pickers(orgId, "client", q);
                return r.ok ? r.data.items : null;
              }}
            />
          </Field>
        )}
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Round">
            <Input value={round} maxLength={40} placeholder="Technical Interview" onChange={(e) => setRound(e.target.value)} />
          </Field>
          <Field label="Length">
            <Select aria-label="Length" value={duration} onChange={setDuration} options={DURATIONS.map((m) => ({ value: String(m), label: `${m} minutes` }))} />
          </Field>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Date" required hint={TZ_HINT}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time" required>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Mode">
            <Select aria-label="Mode" value={mode} onChange={(v) => setMode(v as Mode)} options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
          </Field>
          {mode === "VIDEO" && (
            <Field label="Meeting link">
              <Input value={link} maxLength={300} placeholder="https://" onChange={(e) => setLink(e.target.value)} />
            </Field>
          )}
          {mode === "ONSITE" && (
            <Field label="Location">
              <Input value={location} maxLength={200} placeholder="Office, floor, room" onChange={(e) => setLocation(e.target.value)} />
            </Field>
          )}
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-[13px] font-medium text-ink">Interviewers</legend>
          {people.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <Input aria-label={`Interviewer ${i + 1} name`} value={p.name} maxLength={120} placeholder={i === 0 ? "Primary interviewer" : "Name"} onChange={(e) => setPeople((l) => l.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
              <Input aria-label={`Interviewer ${i + 1} title`} value={p.title ?? ""} maxLength={80} placeholder="Title" onChange={(e) => setPeople((l) => l.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} />
              {i > 0 ? (
                <button type="button" aria-label={`Remove interviewer ${i + 1}`} onClick={() => setPeople((l) => l.filter((_, k) => k !== i))} className="grid h-9 w-9 place-items-center rounded-full hover:bg-paper-2">
                  <XIcon size={14} aria-hidden />
                </button>
              ) : (
                <span className="w-9" />
              )}
            </div>
          ))}
          {people.length < maxInterviewers && (
            <button type="button" onClick={() => setPeople((l) => [...l, { name: "", title: "", primary: false }])} className="text-[13px] font-semibold text-accent-deep hover:underline">
              + Add interviewer
            </button>
          )}
        </fieldset>
        <Field label="Notes" hint="Don't put ID numbers or other sensitive details in a note.">
          <Textarea rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {err && <p role="alert" className="text-[13px] text-danger">{err}</p>}
      </div>
    </Dialog>
  );
}

/** Reschedule: records the new time. A cancelled interview comes back as Scheduled. */
export function RescheduleDialog({
  detail,
  onClose,
  orgId,
  onDone,
}: {
  detail: InterviewDetail | null;
  onClose: () => void;
  orgId: number | string;
  onDone: (d: InterviewDetail) => void;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("45");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = useRef(newKey());
  const id = detail?.id ?? null;

  useEffect(() => {
    if (!detail) return;
    key.current = newKey();
    setDate(detail.scheduledAt.slice(0, 10));
    setTime(detail.scheduledAt.slice(11, 16));
    setDuration(String(detail.durationMinutes));
    setReason("");
    setErr(null);
    // only when a different interview opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function submit() {
    if (!detail || !date || !time || busy) return;
    setBusy(true);
    setErr(null);
    const r = await interviewsApi.reschedule(orgId, detail.id, { scheduledAt: toInstant(date, time), durationMinutes: Number(duration), reason: reason.trim() || null }, key.current);
    setBusy(false);
    if (!r.ok) {
      setErr(errorSentence(r));
      return;
    }
    onDone(r.data);
    onClose();
  }

  const lengths = DURATIONS.includes(Number(duration)) ? DURATIONS : [...DURATIONS, Number(duration)].sort((a, b) => a - b);
  return (
    <Dialog
      open={detail !== null}
      onClose={onClose}
      title="Reschedule interview"
      description="Record the new time. Nobody is notified from here: tell the consultant and the interviewers yourself."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!date || !time || busy} data-reschedule-submit>
            Save new time
          </Button>
        </>
      }
    >
      <div className="space-y-3.5" data-reschedule-dialog>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Date" required hint={TZ_HINT}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time" required>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Length">
          <Select aria-label="Length" value={duration} onChange={setDuration} options={lengths.map((m) => ({ value: String(m), label: `${m} minutes` }))} />
        </Field>
        <Field label="Reason" hint="Optional. Shown in the timeline.">
          <Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {err && <p role="alert" className="text-[13px] text-danger">{err}</p>}
      </div>
    </Dialog>
  );
}

/** Add Feedback: a rating, a recommendation and a short note. */
export function FeedbackDialog({
  detail,
  onClose,
  orgId,
  onDone,
}: {
  detail: InterviewDetail | null;
  onClose: () => void;
  orgId: number | string;
  onDone: (d: InterviewDetail) => void;
}) {
  const [rating, setRating] = useState(0);
  const [rec, setRec] = useState<Recommendation | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = useRef(newKey());
  const id = detail?.id ?? null;

  useEffect(() => {
    if (!detail) return;
    key.current = newKey();
    setRating(0);
    setRec("");
    setNote("");
    setErr(null);
    // only when a different interview opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function submit() {
    if (!detail || !rating || !rec || busy) return;
    setBusy(true);
    setErr(null);
    const r = await interviewsApi.feedback(orgId, detail.id, { rating, recommendation: rec, note: note.trim() || null }, key.current);
    setBusy(false);
    if (!r.ok) {
      setErr(errorSentence(r));
      return;
    }
    onDone(r.data);
    onClose();
  }

  return (
    <Dialog
      open={detail !== null}
      onClose={onClose}
      title="Add feedback"
      description="Record how the interview went. It is saved on the interview and visible to your team."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!rating || !rec || busy} data-feedback-submit>
            Add feedback
          </Button>
        </>
      }
    >
      <div className="space-y-3.5" data-feedback-dialog>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-ink">Rating</legend>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} of 5`}
                onClick={() => setRating(n)}
                className={`grid h-10 w-10 place-items-center rounded-lg border text-[14px] font-bold ${rating === n ? "border-accent bg-accent text-on-accent" : "border-line bg-paper text-ink hover:bg-paper-2"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-ink">Recommendation</legend>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Recommendation">
            {RECOMMENDATIONS.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={rec === r}
                onClick={() => setRec(r)}
                className={`min-h-10 rounded-lg border px-3.5 text-[13.5px] font-semibold ${rec === r ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-paper text-ink hover:bg-paper-2"}`}
              >
                {RECOMMENDATION_LABEL[r]}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="Note" hint="Don't put ID numbers or other sensitive details in a note.">
          <Textarea rows={4} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {err && <p role="alert" className="text-[13px] text-danger">{err}</p>}
      </div>
    </Dialog>
  );
}
