"use client";
/* eslint-disable react-hooks/set-state-in-effect -- the autosave fields mirror the saved value into their local text when it changes */

import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import {
  BottomSheet,
  Button,
  CalendarIcon,
  ChevronDownIcon,
  ClipboardCheckIcon,
  CopyIcon,
  ErrorState,
  IconButton,
  Input,
  MapPinIcon,
  MemberAvatar,
  Menu,
  MessageIcon,
  PhoneIcon,
  SendIcon,
  SideSheet,
  Skeleton,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Textarea,
  TimelineFeed,
  VideoIcon,
  XIcon,
  useToast,
} from "@kiwiply/ui";
import type { TimelineEvent } from "@kiwiply/ui";
import {
  eventTitle,
  formatDay,
  formatStamp,
  formatWhenLine,
  modeLabel,
  RECOMMENDATION_LABEL,
  statusLabel,
  stepLine,
  type DetailTab,
  type EventItem,
  type InterviewDetail,
  type Interviewer,
  type PatchBody,
  type Step,
} from "@/lib/ent/interviews";
import { useInterviewDetail, useReminder, useStatusMove, type SaveResult } from "./hooks";
import { ClientTile } from "./parts";

export type DrawerMode = "dock" | "overlay" | "sheet";

export const AUTOSAVE_MS = 800; // config-literal-ok: how long typing rests before a field is saved (UI timing)
const WORK_MODE: Record<string, string> = { REMOTE: "Remote", HYBRID: "Hybrid", ON_SITE: "On-site" };

export interface DetailDrawerProps {
  orgId: number | string;
  interviewId: number | null;
  mode: DrawerMode;
  tab: DetailTab;
  onTab: (t: DetailTab) => void;
  onClose: () => void;
  /** A saved or moved interview: the table row and the tiles refresh from it. */
  onChanged: (d: InterviewDetail) => void;
  /** Bumped by the page when something outside the drawer changed this interview. */
  reloadToken: number;
  /** The most interviewers one interview may list (an organization setting). */
  maxInterviewers: number;
  /** The page owns the reschedule and feedback dialogs; the drawer asks it to open them. */
  onReschedule: (d: InterviewDetail) => void;
  onFeedback: (d: InterviewDetail) => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}

/* ── Interview Progress: the rounds of the application, the current one marked ──────── */

export function ProgressSteps({ steps }: { steps: Step[] }) {
  return (
    <ol className="mt-3" aria-label="Interview progress" data-progress>
      {steps.map((s, i) => {
        const current = s.state === "CURRENT";
        const done = s.state === "DONE";
        const last = i === steps.length - 1;
        return (
          <li key={s.key} data-step={s.key} data-step-state={s.state} aria-current={current ? "step" : undefined} className="relative flex gap-3 pb-3.5 last:pb-0">
            {!last && <span aria-hidden className="absolute left-[11px] top-7 h-[calc(100%-1.6rem)] w-px bg-[var(--ent-table-line,var(--color-line))]" />}
            <span
              className={`relative z-10 grid h-6 w-6 flex-none place-items-center rounded-full text-[11.5px] font-bold ${
                current ? "bg-accent text-on-accent ring-4 ring-accent-soft" : done ? "bg-accent-soft text-accent-deep" : "bg-paper-2 text-muted"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className="min-w-0 leading-tight">
              <span className={`block truncate text-[13px] ${current ? "font-bold text-ink" : "font-semibold text-ink"}`}>
                {s.label}
                {s.state === "CANCELLED" && <span className="ml-1.5 text-[11.5px] font-medium text-danger">Cancelled</span>}
              </span>
              <span className="block truncate text-[12px] text-muted">{stepLine(s)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Section({ title, children, action, testId }: { title: string; children: ReactNode; action?: ReactNode; testId?: string }) {
  return (
    <section aria-label={title} className="rounded-xl border border-[var(--ent-table-line,var(--color-line))] p-3" data-section={testId}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[13.5px] font-bold text-ink">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

type FieldStatus = "idle" | "saving" | "saved" | "error";

/** A text field saved as you type (800 ms after the last key, at once on blur). No Save button. */
function AutosaveField({
  label,
  value,
  field,
  save,
  multiline = false,
  maxLength,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  field: "notes" | "nextStep" | "meetingLink" | "location";
  save: (b: PatchBody) => Promise<SaveResult>;
  multiline?: boolean;
  maxLength?: number;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const [status, setStatus] = useState<FieldStatus>("idle");
  const [err, setErr] = useState<string | null>(null);
  const last = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  });
  useEffect(() => {
    if (textRef.current.trim() === last.current.trim()) {
      last.current = value;
      setText(value);
    }
  }, [value]);

  async function commit() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = textRef.current.trim();
    if (next === last.current.trim()) {
      setStatus("idle");
      return;
    }
    setStatus("saving");
    setErr(null);
    const r = await save({ [field]: next === "" ? null : next });
    if (r.ok) {
      const saved = field === "notes" ? r.detail.notes : field === "nextStep" ? r.detail.nextStepCustom : field === "meetingLink" ? r.detail.meetingLink : r.detail.interviewLocation;
      last.current = saved ?? "";
      setStatus("saved");
    } else {
      setErr(r.message);
      setStatus("error");
    }
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onChange = (v: string) => {
    setText(v);
    textRef.current = v;
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void commit(), AUTOSAVE_MS);
  };
  return (
    <div className={className}>
      {multiline ? (
        <Textarea aria-label={label} value={text} rows={3} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onBlur={() => void commit()} data-autosave={field} data-autosave-status={status} className="!text-[12.5px] !leading-snug" />
      ) : (
        <Input aria-label={label} value={text} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onBlur={() => void commit()} data-autosave={field} data-autosave-status={status} className="!text-[12px]" />
      )}
      <p role="status" className={`mt-0.5 min-h-4 text-[11.5px] ${status === "error" ? "text-danger" : "text-muted"}`}>
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : status === "error" ? err : ""}
      </p>
    </div>
  );
}

/** The interviewers as the board draws them (avatar, name, title, Primary); editing keeps a list of name and title rows saved as you type. */
function InterviewerList({ people, editing, save, max }: { people: Interviewer[]; editing: boolean; save: (b: PatchBody) => Promise<SaveResult>; max: number }) {
  const [rows, setRows] = useState(people.map((p) => ({ name: p.name, title: p.title ?? "" })));
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sig = people.map((p) => `${p.name}|${p.title ?? ""}`).join(";");
  useEffect(() => {
    setRows(people.map((p) => ({ name: p.name, title: p.title ?? "" })));
    // the list is rebuilt only when the saved people change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function push(next: { name: string; title: string }[]) {
    setRows(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const named = next.filter((r) => r.name.trim());
      void save({ interviewers: named.map((r, i) => ({ name: r.name.trim(), title: r.title.trim() || null, primary: i === 0 })) }).then((r) => setErr(r.ok ? null : r.message));
    }, AUTOSAVE_MS);
  }

  if (!editing) {
    if (people.length === 0) return <p className="mt-2 text-[12.5px] text-muted">No interviewers recorded.</p>;
    return (
      <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-3" data-interviewers-list>
        {people.map((p, i) => (
          <li key={`${p.name}-${i}`} className="flex min-w-0 items-start gap-2">
            <MemberAvatar name={p.name} size={36} />
            <span className="min-w-0 leading-tight">
              <span className="block break-words text-[12.5px] font-bold text-ink">{p.name}</span>
              <span className="block break-words text-[11.5px] text-muted">{p.title ?? "Interviewer"}</span>
              {p.primary && <span className="mt-1 inline-block rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent-deep">Primary</span>}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="mt-2.5 space-y-2" data-interviewers-edit>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-1.5">
          <Input aria-label={`Interviewer ${i + 1} name`} value={r.name} maxLength={120} placeholder="Name" onChange={(e) => push(rows.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} className="!text-[12px]" />
          <Input aria-label={`Interviewer ${i + 1} title`} value={r.title} maxLength={80} placeholder="Title" onChange={(e) => push(rows.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} className="!text-[12px]" />
          <button type="button" aria-label={`Remove interviewer ${i + 1}`} onClick={() => push(rows.filter((_, k) => k !== i))} className="grid h-8 w-8 place-items-center rounded-full hover:bg-paper-2">
            <XIcon size={13} aria-hidden />
          </button>
        </div>
      ))}
      {rows.length < max && (
        <button type="button" onClick={() => setRows((l) => [...l, { name: "", title: "" }])} className="text-[12.5px] font-semibold text-accent-deep hover:underline">
          + Add interviewer
        </button>
      )}
      {err && <p role="alert" className="text-[11.5px] text-danger">{err}</p>}
    </div>
  );
}

function toFeed(events: EventItem[]): TimelineEvent[] {
  return events.map((e) => ({
    id: `t-${e.id}`,
    at: e.at,
    source: "application_event" as const,
    title: eventTitle(e),
    detail: e.detail ?? undefined,
    actor: e.actor ? { name: e.actor.name } : undefined,
  }));
}

function Loading() {
  return (
    <div role="status" aria-label="Loading interview" className="space-y-3 py-2">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

const MODE_ICON = { VIDEO: VideoIcon, ONSITE: MapPinIcon, PHONE: PhoneIcon } as const;
const MODE_TEXT = { VIDEO: "Video Conference", ONSITE: "Onsite", PHONE: "Phone call" } as const;

/** The right-hand drawer: docks in the column beside the table on a wide screen, floats over it on a tablet, rises from the bottom on a phone. */
export default function DetailDrawer(p: DetailDrawerProps) {
  const open = p.interviewId !== null;
  const toast = useToast();
  const { state, replace, save } = useInterviewDetail(p.orgId, p.interviewId, p.reloadToken);
  const [editFor, setEditFor] = useState<number | null>(null);
  const editing = editFor !== null && editFor === p.interviewId;
  const changed = (d: InterviewDetail) => {
    replace(d);
    p.onChanged(d);
  };
  const move = useStatusMove(p.orgId, changed);
  const remind = useReminder(p.orgId, changed);

  const saveAndNote = async (b: PatchBody): Promise<SaveResult> => {
    const r = await save(b);
    if (r.ok) p.onChanged(r.detail);
    return r;
  };

  const detail = state.status === "ok" ? state.detail : null;

  const body = (() => {
    if (state.status === "idle" || state.status === "loading") return <Loading />;
    if (state.status === "gone") return <ErrorState variant="inline" what="this interview" description="It is no longer in your view. It may have moved out of your scope." />;
    if (state.status === "error") return <ErrorState variant="inline" what="this interview" description={state.message} />;
    const d = state.detail;
    const ModeIcon = MODE_ICON[d.mode];
    const statusOptions = d.actions.changeStatus ? d.nextStatuses : [];
    const place = d.workMode ? (WORK_MODE[d.workMode] ?? d.workMode) : d.location;
    return (
      <div data-detail-body data-interview-id={d.id}>
        <div className="mt-1 space-y-1.5" data-drawer-sub>
          <h3 className="text-[15px] font-bold leading-tight text-ink">{d.jobTitle ?? "Not linked to a job"}</h3>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] text-ink-soft">{d.jobCode ?? d.code}</span>
            <span className="flex min-w-0 items-center gap-1.5">
              <ClientTile client={d.client} size={26} />
              <span className="truncate text-[12px] text-ink-soft">{d.client.name}</span>
            </span>
          </div>
          {place && (
            <p className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
              <MapPinIcon size={14} aria-hidden className="text-ink-soft" /> {place}
            </p>
          )}
          <p className="flex items-center gap-1.5 text-[12.5px] text-ink-soft" data-when>
            <CalendarIcon size={14} aria-hidden /> {formatWhenLine(d.scheduledAt, d.durationMinutes)}
          </p>
        </div>

        <Tabs value={p.tab} onValueChange={(v) => p.onTab(v as DetailTab)} variant="underline" className="mt-3">
          <TabList aria-label="Interview details">
            <Tab value="details">Details</Tab>
            <Tab value="timeline">Timeline</Tab>
            <Tab value="feedback">Feedback{d.feedback.length > 0 ? ` (${d.feedback.length})` : ""}</Tab>
            <Tab value="documents">Documents</Tab>
          </TabList>

          <TabPanel value="details" className="space-y-2.5 pt-3">
            <Section
              title="Interview Progress"
              testId="progress"
            >
              <ProgressSteps steps={d.steps} />
              {statusOptions.length > 0 && (
                <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[var(--ent-table-line,var(--color-line))] pt-2">
                  <span className="text-[11.5px] text-muted">Status: {statusLabel(d.status)}</span>
                  <Menu
                    trigger={
                      <Button type="button" variant="accent-soft" size="sm" data-status-trigger>
                        Record a change <ChevronDownIcon size={13} aria-hidden />
                      </Button>
                    }
                    items={statusOptions.map((s) => ({ label: `Record as ${statusLabel(s)}`, onSelect: () => void move(d.id, s) }))}
                  />
                </div>
              )}
            </Section>

            <Section
              title="Meeting Details"
              testId="meeting"
              action={
                d.actions.edit ? (
                  <button type="button" onClick={() => setEditFor(editing ? null : d.id)} aria-pressed={editing} className="text-[12.5px] font-semibold text-accent-deep hover:underline" data-edit-toggle>
                    {editing ? "Done" : "Edit"}
                  </button>
                ) : null
              }
            >
              <dl className="mt-2 space-y-2 text-[12.5px]">
                <div className="grid grid-cols-[5.2rem_1fr] items-center gap-x-2">
                  <dt className="text-muted">Mode</dt>
                  <dd className="flex items-center gap-1.5 text-ink">
                    <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-accent-soft text-accent-deep">
                      <ModeIcon size={15} />
                    </span>
                    {MODE_TEXT[d.mode]}
                  </dd>
                </div>
                {d.mode === "VIDEO" && (
                  <div className="grid grid-cols-[5.2rem_1fr] items-start gap-x-1.5">
                    <dt className="whitespace-nowrap pt-1.5 text-[11.5px] text-muted">Meeting Link</dt>
                    <dd className="min-w-0">
                      {editing && d.actions.edit ? (
                        <AutosaveField label="Meeting link" value={d.meetingLink ?? ""} field="meetingLink" save={saveAndNote} maxLength={300} placeholder="https://" />
                      ) : d.meetingLink ? (
                        <span className="flex items-center gap-1.5">
                          <a href={d.meetingLink} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate rounded-lg border border-accent/25 bg-accent-soft/40 px-1.5 py-1.5 text-[10.5px] text-accent-deep hover:underline" data-meeting-link>
                            {d.meetingLink}
                          </a>
                          <IconButton
                            aria-label="Copy meeting link"
                            title="Copy meeting link"
                            className="!h-8 !w-8 flex-none border border-accent/25 text-accent-deep"
                            onClick={() => {
                              void navigator.clipboard?.writeText(d.meetingLink ?? "").then(
                                () => toast({ title: "Link copied", variant: "success" }),
                                () => toast({ title: "Couldn't copy", description: d.meetingLink ?? "", variant: "error" }),
                              );
                            }}
                          >
                            <CopyIcon size={15} />
                          </IconButton>
                        </span>
                      ) : (
                        <span className="text-muted">No link recorded</span>
                      )}
                    </dd>
                  </div>
                )}
                {d.mode === "ONSITE" && (
                  <div className="grid grid-cols-[5.2rem_1fr] items-start gap-x-2">
                    <dt className="pt-1.5 text-muted">Location</dt>
                    <dd className="min-w-0 text-ink">
                      {editing && d.actions.edit ? <AutosaveField label="Location" value={d.interviewLocation ?? ""} field="location" save={saveAndNote} maxLength={200} /> : (d.interviewLocation ?? <span className="text-muted">Not recorded</span>)}
                    </dd>
                  </div>
                )}
                {editing && d.actions.edit && (
                  <div className="grid grid-cols-[5.2rem_1fr] items-center gap-x-2">
                    <dt className="text-muted">Change mode</dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {(["VIDEO", "ONSITE", "PHONE"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={d.mode === m}
                          onClick={() => void saveAndNote({ mode: m })}
                          className={`rounded-lg border px-2.5 py-1 text-[12px] font-semibold ${d.mode === m ? "border-accent bg-accent-soft text-accent-deep" : "border-line text-ink-soft hover:bg-paper-2"}`}
                        >
                          {modeLabel(m)}
                        </button>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>

              <h4 className="mt-3.5 text-[13.5px] font-bold text-ink">Interviewers</h4>
              <InterviewerList people={d.interviewers} editing={editing && d.actions.edit} save={saveAndNote} max={p.maxInterviewers} />

              <h4 className="mt-3.5 text-[13.5px] font-bold text-ink">Notes</h4>
              {d.actions.edit ? (
                <AutosaveField label="Notes" value={d.notes ?? ""} field="notes" save={saveAndNote} multiline maxLength={1000} placeholder="Add a note for your team" className="mt-1.5" />
              ) : (
                <p className="mt-1.5 whitespace-pre-wrap rounded-lg border border-line p-2.5 text-[12.5px] leading-snug text-ink-soft">{d.notes ?? "No notes."}</p>
              )}
              {d.actions.edit && (
                <>
                  <h4 className="mt-2 text-[13.5px] font-bold text-ink">Next Step</h4>
                  <AutosaveField label="Next step" value={d.nextStepCustom ?? ""} field="nextStep" save={saveAndNote} maxLength={120} placeholder={d.nextStep} className="mt-1.5" />
                </>
              )}
              {d.reminderRequestedAt && <p className="mt-1 text-[11.5px] text-muted">Reminder recorded {formatStamp(d.reminderRequestedAt)} UTC.</p>}
            </Section>
          </TabPanel>

          <TabPanel value="timeline" className="pt-3">
            <TimelineFeed events={toFeed(d.timeline)} empty="Nothing has been recorded for this interview yet." />
          </TabPanel>

          <TabPanel value="feedback" className="pt-3">
            {d.feedback.length === 0 ? (
              <p className="py-3 text-center text-[13px] text-muted" data-feedback-empty>
                No feedback has been added yet.
              </p>
            ) : (
              <ul className="space-y-2.5" data-feedback-list>
                {d.feedback.map((f) => (
                  <li key={f.id} data-feedback-id={f.id} className="rounded-xl border border-line bg-paper-2/40 p-3">
                    <div className="flex items-center gap-2 text-[12px] text-muted">
                      {f.author && <MemberAvatar name={f.author.name} size={22} />}
                      <span className="font-semibold text-ink-soft">{f.author?.name ?? "Someone"}</span>
                      <span>{formatDay(f.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 text-[13px] font-semibold text-ink">
                      {f.rating} of 5 &middot; {RECOMMENDATION_LABEL[f.recommendation]}
                    </p>
                    {f.note && <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-ink-soft">{f.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </TabPanel>

          <TabPanel value="documents" className="pt-3">
            {d.documents.length === 0 ? (
              <p className="py-3 text-center text-[13px] text-muted" data-documents-empty>
                No documents are attached to this interview&apos;s application.
              </p>
            ) : (
              <ul className="space-y-2" data-documents-list>
                {d.documents.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-2.5 rounded-xl border border-line p-3">
                    <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-accent-soft text-accent-deep">
                      <ClipboardCheckIcon size={17} />
                    </span>
                    <span className="min-w-0 leading-tight">
                      <span className="block truncate text-[13px] font-semibold text-ink">{doc.name ?? doc.fileName ?? "Resume"}</span>
                      <span className="block truncate text-[11.5px] text-muted">
                        {doc.kind}
                        {doc.versionNo ? ` · version ${doc.versionNo}` : ""}
                        {doc.primary ? " · primary" : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TabPanel>
        </Tabs>
      </div>
    );
  })();

  /* the three actions of the board: always drawn for someone who may edit, greyed with the reason when the interview's status does not allow one */
  const footer = detail && detail.actions.edit ? (
    <div className="space-y-2" data-drawer-actions>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="accent-soft"
          size="sm"
          disabled={!detail.actions.reschedule}
          title={detail.actions.reschedule ? undefined : "Only a scheduled or cancelled interview can be rescheduled"}
          onClick={() => p.onReschedule(detail)}
          data-action="reschedule"
          className="w-full !gap-1.5 !border !border-accent/40 !bg-paper !px-2 whitespace-nowrap"
        >
          <CalendarIcon size={15} aria-hidden /> Reschedule
        </Button>
        <Button
          type="button"
          variant="accent-soft"
          size="sm"
          disabled={!detail.actions.remind}
          title={detail.actions.remind ? undefined : "A reminder can be recorded for a scheduled interview"}
          onClick={() => void remind(detail.id)}
          data-action="remind"
          className="w-full !gap-1.5 !border !border-accent/40 !bg-paper !px-2 whitespace-nowrap"
        >
          <SendIcon size={15} aria-hidden /> Send Reminder
        </Button>
      </div>
      <Button
        type="button"
        variant="accent"
        disabled={!detail.actions.feedback}
        title={detail.actions.feedback ? undefined : "Feedback can be added once the interview has started"}
        onClick={() => p.onFeedback(detail)}
        data-action="feedback"
        className="w-full"
      >
        <MessageIcon size={16} aria-hidden /> Add Feedback
      </Button>
    </div>
  ) : null;

  const header = detail ? (
    <div className="flex items-start gap-2.5" data-drawer-head>
      <MemberAvatar name={detail.consultant.name} size={44} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="truncate text-[15px] font-bold text-ink">{detail.consultant.name}</h3>
          {detail.consultant.status === "ACTIVE" ? <span className="ent-pill" data-tone="green" data-shape="round">Active</span> : detail.consultant.status ? <span className="ent-pill" data-tone="grey" data-shape="round">{detail.consultant.status.charAt(0) + detail.consultant.status.slice(1).toLowerCase()}</span> : null}
        </div>
        {detail.consultant.subtitle && (
          <span className="ent-pill mt-1.5" data-tone="purple" data-shape="round">
            {detail.consultant.subtitle}
          </span>
        )}
      </div>
    </div>
  ) : null;

  const title = detail ? detail.consultant.name : "Interview";
  const description = detail ? `${detail.code} · ${statusLabel(detail.status)}` : undefined;
  if (p.mode === "sheet") {
    return (
      <>
        <BottomSheet id="ent-interview-sheet" open={open} onClose={p.onClose} title={title} description={description} returnFocusTo={p.returnFocusTo} defaultSnap="partial" footer={footer ?? undefined}>
          {header && <div className="mb-3">{header}</div>}
          {body}
        </BottomSheet>
      </>
    );
  }
  if (p.mode === "overlay") {
    return (
      <>
        <SideSheet id="ent-interview-sheet" side="right" mode="overlay" width={440} open={open} onClose={p.onClose} title={title} description={description} returnFocusTo={p.returnFocusTo} footer={footer ?? undefined}>
          {body}
        </SideSheet>
      </>
    );
  }
  /* docked: a card in the right-hand column under the help card, with the board's own header and a footer that stays in view */
  if (!open) return null;
  return (
    <>
      <aside aria-label="Interview details" data-drawer-dock className="ent-card flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="relative border-b border-[var(--ent-table-line,var(--color-line))] px-3.5 pb-3 pt-3.5">
          {header ?? <Skeleton className="h-11 w-2/3" />}
          <button type="button" onClick={p.onClose} aria-label="Close interview details" className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-accent">
            <XIcon size={16} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-3 pt-3">{body}</div>
        {footer && <div className="border-t border-[var(--ent-table-line,var(--color-line))] px-3.5 py-3">{footer}</div>}
      </aside>
    </>
  );
}
