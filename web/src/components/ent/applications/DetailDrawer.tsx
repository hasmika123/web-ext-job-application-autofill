"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import {
  ArrowRightIcon,
  BottomSheet,
  Button,
  ChevronDownIcon,
  ChevronUpIcon,
  ErrorState,
  IconButton,
  Input,
  Menu,
  MemberAvatar,
  PencilIcon,
  Select,
  ShieldCheckIcon,
  SideSheet,
  Skeleton,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Textarea,
  TimelineFeed,
  useToast,
} from "@kiwiply/ui";
import type { TimelineEvent } from "@kiwiply/ui";
import {
  appliedText,
  applicationsApi,
  errorSentence,
  eventTitle,
  formatDay,
  formatShort,
  moveOptions,
  type ApplicationDetail,
  type CloseReason,
  type DetailTab,
  type EventItem,
  type PatchBody,
  type PickerItem,
  type Step,
} from "@/lib/ent/applications";
import type { Viewer } from "@/lib/actors";
import { useApplicationDetail, useStageMove, type SaveResult } from "./hooks";
import { UpdatedMeta, changesDetail, feedActor, seatViewer } from "./changeAudit";
import { ClientTile, StagePill } from "./parts";

export type DrawerMode = "push" | "overlay" | "sheet";

export const AUTOSAVE_MS = 800; // config-literal-ok: how long typing rests before a field is saved (UI timing)
const EMPLOYMENT: Record<string, string> = { FTE: "Full-time", CONTRACT: "Contract", C2C: "Corp-to-corp" };

export interface DetailDrawerProps {
  orgId: number | string;
  orgName: string;
  applicationId: number | null;
  mode: DrawerMode;
  tab: DetailTab;
  onTab: (t: DetailTab) => void;
  onClose: () => void;
  /** A saved or moved application: the table row and the tiles refresh from it. */
  onChanged: (d: ApplicationDetail) => void;
  /** Bumped by the page when something outside the drawer changed this application. */
  reloadToken: number;
  /** Where "View job" and "View profile" lead (the workspace pages), or null when the menu does not list them. */
  jobsHref: string | null;
  consultantsHref: string | null;
  /** The viewer's own seat: "you" in "Updated 2h ago by you" and the feed is decided by comparing it with the actor. */
  selfMemberId?: number | null;
  returnFocusTo?: RefObject<HTMLElement | null>;
}

/* ── Application progress: the six stages with the date each was recorded ──────────── */

export function ProgressSteps({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex items-start" aria-label="Application progress" data-progress>
      {steps.map((s, i) => {
        const done = s.state === "DONE";
        const current = s.state === "CURRENT";
        return (
          <li key={s.stage} data-step={s.stage} data-step-state={s.state} aria-current={current ? "step" : undefined} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
            {i > 0 && <span aria-hidden className={`absolute left-[-50%] right-[50%] top-[10px] h-[2px] ${steps[i - 1].state === "DONE" ? "bg-[var(--ent-x-22b36b)]" : "bg-[var(--ent-x-dfe6f1)]"}`} />}
            <span
              className={`relative z-10 grid h-[22px] w-[22px] place-items-center rounded-full border text-[10.5px] font-bold ${
                done ? "border-[var(--ent-x-22b36b)] bg-[var(--ent-x-22b36b)] text-white" : current ? "border-[var(--ent-x-2b6df0)] bg-[var(--ent-x-2b6df0)] text-white ring-[3px] ring-[var(--ent-x-dbe8ff)]" : "border-[var(--ent-x-cfd8e8)] bg-white text-[var(--ent-soft)]"
              }`}
            >
              {done ? "\u2713" : i + 1}
            </span>
            <span className={`mt-1 text-[9px] font-medium leading-[1.15] ${current ? "text-[var(--ent-title)]" : "text-[var(--ent-x-46527e)]"}`}>{s.label}</span>
            <span className="text-[8.5px] leading-tight text-[var(--ent-soft)]">{s.reachedAt ? formatShort(s.reachedAt) : " "}</span>
            {current && <span className="mt-0.5 rounded-[4px] bg-[var(--ent-x-e1edff)] px-1.5 py-px text-[8.5px] font-semibold text-[var(--ent-x-1d57c2)]">Current</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Row({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="grid grid-cols-[104px_1fr] items-center gap-x-3 py-[5px] text-[11px]" data-field={testId}>
      <dt className="text-[var(--ent-x-46527e)]">{label}</dt>
      <dd className="min-w-0 text-[var(--ent-title)]">{children}</dd>
    </div>
  );
}

type FieldStatus = "idle" | "saving" | "saved" | "error";

/** A text or date field saved as you type (800 ms after the last key, at once on blur). No Save button. */
function AutosaveField({
  label,
  value,
  type,
  maxLength,
  save,
  field,
}: {
  label: string;
  value: string;
  type: "text" | "date";
  maxLength?: number;
  save: (b: PatchBody) => Promise<SaveResult>;
  field: "nextAction" | "nextActionDue";
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
      last.current = (field === "nextAction" ? r.detail.nextAction : r.detail.nextActionDue) ?? "";
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

  return (
    <div>
      <Input
        type={type}
        aria-label={label}
        value={text}
        maxLength={maxLength}
        onChange={(e) => {
          setText(e.target.value);
          textRef.current = e.target.value;
          setStatus("idle");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void commit(), type === "date" ? 0 : AUTOSAVE_MS);
        }}
        onBlur={() => void commit()}
        data-autosave={field}
        data-autosave-status={status}
      />
      <p role="status" className={`mt-0.5 min-h-4 text-[11.5px] ${status === "error" ? "text-danger" : "text-muted"}`}>
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : status === "error" ? err : ""}
      </p>
    </div>
  );
}

function MarketerField({ orgId, detail, save }: { orgId: number | string; detail: ApplicationDetail; save: (b: PatchBody) => Promise<SaveResult> }) {
  const [options, setOptions] = useState<PickerItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void applicationsApi.pickers(orgId, "marketer", "").then((r) => {
      if (live) setOptions(r.ok ? r.data.items : []);
    });
    return () => {
      live = false;
    };
  }, [orgId]);
  const current = detail.marketer ? String(detail.marketer.memberId) : "";
  const list = [{ value: "", label: "Unassigned" }, ...(options ?? []).map((o) => ({ value: String(o.id), label: o.label }))];
  if (detail.marketer && !list.some((o) => o.value === current)) list.push({ value: current, label: detail.marketer.name });
  return (
    <div>
      <Select
        aria-label="Assigned marketer"
        value={current}
        options={list}
        onChange={(v) => {
          setErr(null);
          void save({ marketerMemberId: v === "" ? null : Number(v) }).then((r) => {
            if (!r.ok) setErr(r.message);
          });
        }}
      />
      {err && <p role="alert" className="mt-0.5 text-[11.5px] text-danger">{err}</p>}
    </div>
  );
}

/** The history as a feed: who did it comes from the change-audit actor (name + relation tag; "Kiwiply SYSTEM" for the platform), not from the stored marketer. */
function toFeed(events: EventItem[], prefix: string, me: Viewer): TimelineEvent[] {
  return events.map((e) => ({
    id: `${prefix}-${e.id}`,
    at: e.at,
    source: "application_event" as const,
    title: eventTitle(e),
    detail: changesDetail(e.changes, e.detail ?? undefined) ?? undefined,
    actor: e.by ? feedActor(e.by, me) : e.actor ? { name: e.actor.name } : undefined,
  }));
}

function NotesPanel({ orgId, detail, onSaved }: { orgId: number | string; detail: ApplicationDetail; onSaved: (d: ApplicationDetail) => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function add() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setErr(null);
    const r = await applicationsApi.addNote(orgId, detail.id, body);
    setBusy(false);
    if (!r.ok) {
      setErr(errorSentence(r));
      return;
    }
    setText("");
    toast({ title: "Note added", variant: "success" });
    onSaved(r.data);
  }
  return (
    <div className="space-y-3" data-notes>
      {detail.actions.addNote && (
        <div>
          <Textarea
            aria-label="Add a note"
            placeholder="Add a note for your team"
            rows={3}
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
          />
          {err && <p role="alert" className="mt-1 text-[12px] text-danger">{err}</p>}
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="text-[11.5px] text-muted">Don&apos;t put ID numbers or other sensitive details in a note. Ctrl+Enter adds it.</p>
            <Button type="button" size="sm" onClick={() => void add()} disabled={busy || text.trim() === ""}>
              Add note
            </Button>
          </div>
        </div>
      )}
      {detail.notes.length === 0 ? (
        <p className="py-3 text-center text-[13px] text-muted">No notes on this application yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {detail.notes.map((n) => (
            <li key={n.id} data-note-id={n.id} className="rounded-xl border border-line bg-paper-2/40 p-3">
              <div className="flex items-center gap-2 text-[12px] text-muted">
                {n.author && <MemberAvatar name={n.author.name} size={22} />}
                <span className="font-semibold text-ink-soft">{n.author?.name ?? "Someone"}</span>
                <span>{formatDay(n.createdAt)}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-[13.5px] text-ink">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div role="status" aria-label="Loading application" className="space-y-3 py-2">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/** The right-hand drawer: docks beside the table on a wide screen, floats over it on a tablet, rises from the bottom on a phone. */
export default function DetailDrawer(p: DetailDrawerProps) {
  const open = p.applicationId !== null;
  const { state, replace, save } = useApplicationDetail(p.orgId, p.applicationId, p.reloadToken);
  const [editFor, setEditFor] = useState<number | null>(null);
  const editing = editFor !== null && editFor === p.applicationId;
  const [progressOpen, setProgressOpen] = useState(true);
  const seat = seatViewer(p.selfMemberId);
  const [now] = useState(() => Date.now());
  const move = useStageMove(p.orgId, (d) => {
    replace(d);
    p.onChanged(d);
  });

  const saveAndNote = async (b: PatchBody): Promise<SaveResult> => {
    const r = await save(b);
    if (r.ok) p.onChanged(r.detail);
    return r;
  };

  const body = (() => {
    if (state.status === "idle" || state.status === "loading") return <Loading />;
    if (state.status === "gone") return <ErrorState variant="inline" what="this application" description="It is no longer in your view. It may have moved out of your scope." />;
    if (state.status === "error") return <ErrorState variant="inline" what="this application" description={state.message} />;
    const d = state.detail;
    const options = d.actions.moveStage ? moveOptions(d.nextStages) : [];
    return (
      <div data-detail-body data-application-id={d.id} className="space-y-3">
        <div className="ent-card p-3.5">
        <div className="flex items-start gap-2.5 pr-7" data-drawer-head>
          <span aria-hidden className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] bg-[var(--ent-x-ece6ff)] text-[var(--ent-x-7a4cf0)]">
            <ShieldCheckIcon size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[12.5px] font-bold leading-tight text-[var(--ent-title)]" data-drawer-title>{d.jobTitle}</h3>
            <p className="text-[10px] text-[var(--ent-soft)]">{d.code}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StagePill stage={d.stage} reason={d.closedReason} />
              {d.employmentLabel && <span className="ent-pill" data-tone="grey">{EMPLOYMENT[d.employmentLabel] ?? d.employmentLabel}</span>}
            </div>
            <UpdatedMeta className="mt-1.5" updatedAt={d.updatedAt} updatedBy={d.updatedBy} createdAt={d.createdAt} createdBy={d.createdBy} me={seat} now={now} />
          </div>
        </div>
        <div className="mt-2.5 flex items-center gap-2.5">
          <ClientTile client={d.client} size={32} />
          <p className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-[var(--ent-title)]">
            {d.client.name}
            <span className="block text-[10px] font-normal text-[var(--ent-soft)]">{p.orgName}</span>
          </p>
          {p.jobsHref && (
            <Link href={p.jobsHref} className="inline-flex flex-none items-center gap-1 text-[10.5px] font-semibold text-[var(--ent-x-2b5fd6)] hover:underline">
              View Job <ArrowRightIcon size={12} aria-hidden />
            </Link>
          )}
        </div>

        <Tabs value={p.tab} onValueChange={(v) => p.onTab(v as DetailTab)} variant="underline" className="ent-tabs ent-tabs-sm mt-3">
          <TabList aria-label="Application details">
            <Tab value="overview">Overview</Tab>
            <Tab value="timeline">Timeline</Tab>
            <Tab value="notes">Notes ({d.notesCount})</Tab>
            <Tab value="activity">Activity</Tab>
          </TabList>

          <TabPanel value="overview" className="pt-3">
            <section aria-labelledby="progress-h">
              <div className="mb-2 flex items-center justify-between">
                <h4 id="progress-h" className="text-[12px] font-bold text-[var(--ent-title)]">Application progress</h4>
                <IconButton aria-label={progressOpen ? "Hide progress" : "Show progress"} aria-expanded={progressOpen} onClick={() => setProgressOpen((o) => !o)} className="!h-6 !w-6">
                  {progressOpen ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                </IconButton>
              </div>
              {progressOpen && <ProgressSteps steps={d.steps} />}
              {options.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2.5">
                  <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-muted">Applications are never submitted from here. Record what happened here once the consultant or the client has acted.</p>
                  <Menu
                    trigger={
                      <Button type="button" variant="accent-soft" size="sm" data-move-trigger>
                        Record a move <ChevronDownIcon size={14} aria-hidden />
                      </Button>
                    }
                    items={options.map((o) => ({ label: o.label, onSelect: () => void move(d.id, o.stage , o.closedReason as CloseReason | undefined) }))}
                  />
                </div>
              )}
            </section>

            <section aria-labelledby="details-h" className="mt-3">
              <div className="mb-1 flex items-center justify-between">
                <h4 id="details-h" className="text-[12px] font-bold text-[var(--ent-title)]">Application details</h4>
                {d.actions.edit && (
                  <button type="button" onClick={() => setEditFor(editing ? null : d.id)} aria-pressed={editing} className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[var(--ent-x-2b5fd6)] hover:underline" data-edit-toggle>
                    <PencilIcon size={12} aria-hidden /> {editing ? "Done" : "Edit"}
                  </button>
                )}
              </div>
              <dl>
                <Row label="Consultant" testId="consultant">
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <MemberAvatar name={d.consultant.name} size={22} />
                      <span className="truncate font-semibold">{d.consultant.name}</span>
                    </span>
                    {p.consultantsHref && (
                      <Link href={p.consultantsHref} className="inline-flex flex-none items-center gap-1 text-[10.5px] font-semibold text-[var(--ent-x-2b5fd6)] hover:underline">
                        View Profile <ArrowRightIcon size={12} aria-hidden />
                      </Link>
                    )}
                  </span>
                </Row>
                <Row label="Job title" testId="job">{d.jobTitle}</Row>
                <Row label="Client / Company" testId="client">{d.client.name} ({p.orgName})</Row>
                <Row label="Applied date" testId="applied">{appliedText(d.appliedOn)}</Row>
                <Row label="Current stage" testId="stage"><StagePill stage={d.stage} reason={d.closedReason} /></Row>
                <Row label="Assigned marketer" testId="marketer">
                  {editing && d.actions.reassign ? (
                    <MarketerField orgId={p.orgId} detail={d} save={saveAndNote} />
                  ) : d.marketer ? (
                    <span className="flex items-center gap-2">
                      <MemberAvatar name={d.marketer.name} size={22} />
                      <span className="font-semibold">{d.marketer.name}</span>
                    </span>
                  ) : (
                    <span className="text-muted">Unassigned</span>
                  )}
                </Row>
                <Row label="Next action" testId="next-action">
                  {editing && d.stage !== "CLOSED" ? <AutosaveField label="Next action" value={d.nextAction ?? ""} type="text" maxLength={120} save={saveAndNote} field="nextAction" /> : d.stage === "CLOSED" ? <span className="text-muted">N/A</span> : d.nextAction ?? <span className="text-muted">None set</span>}
                </Row>
                <Row label="Due date" testId="due">
                  {editing && d.stage !== "CLOSED" ? (
                    <AutosaveField label="Due date" value={d.nextActionDue ?? ""} type="date" save={saveAndNote} field="nextActionDue" />
                  ) : d.stage === "CLOSED" || !d.nextActionDue ? (
                    <span className="text-muted">{d.stage === "CLOSED" ? "N/A" : "None set"}</span>
                  ) : (
                    <span className={d.overdue ? "font-semibold text-danger" : undefined}>{formatDay(d.nextActionDue)}{d.overdue ? " (overdue)" : ""}</span>
                  )}
                </Row>
                <Row label="Source" testId="source">{d.source ?? <span className="text-muted">Not recorded</span>}</Row>
                <Row label="Application ID" testId="code">{d.code}</Row>
              </dl>
            </section>
          </TabPanel>

          <TabPanel value="timeline" className="pt-3">
            <TimelineFeed events={toFeed(d.timeline, "t", seat)} empty="No stage changes have been recorded yet." />
          </TabPanel>
          <TabPanel value="notes" className="pt-3">
            <NotesPanel
              orgId={p.orgId}
              detail={d}
              onSaved={(next) => {
                replace(next);
                p.onChanged(next);
              }}
            />
          </TabPanel>
          <TabPanel value="activity" className="pt-3">
            <TimelineFeed events={toFeed(d.activity, "a", seat)} empty="Nothing has happened on this application yet." />
          </TabPanel>
        </Tabs>
        </div>
      </div>
    );
  })();

  const title = state.status === "ok" ? state.detail.jobTitle : "Application";
  const description = state.status === "ok" ? state.detail.code : undefined;

  if (p.mode === "sheet") {
    return (
      <BottomSheet id="ent-application-sheet" open={open} onClose={p.onClose} title={title} description={description} returnFocusTo={p.returnFocusTo} defaultSnap="partial">
        {body}
      </BottomSheet>
    );
  }
  const sheet = (
    <SideSheet id="ent-application-sheet" side="right" mode={p.mode} bare className="ent-drawer ent-drawer-col" width={p.mode === "push" ? 380 : 480} open={open} onClose={p.onClose} title={title} description={description} returnFocusTo={p.returnFocusTo}>
      {body}
    </SideSheet>
  );
  if (p.mode === "push") {
    return <div className={`ent-drawer-slot sticky top-2 shrink-0 self-start ${open ? "ml-[18px]" : ""}`}>{sheet}</div>;
  }
  return sheet;
}

