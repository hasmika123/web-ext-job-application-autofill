"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import {
  BookOpenIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ErrorState,
  FileTextIcon,
  MapPinIcon,
  Menu,
  MoreVerticalIcon,
  PencilIcon,
  PhoneIcon,
  Skeleton,
  VideoIcon,
  cn,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import ConsultantInterviewPrepPage from "./InterviewPrepPage";
import { PageTabs, useUrlTab } from "./tabs";
import { BASE, Card, CompanyMark, Empty, Pill, TABLE, TD, useWorkspaceData } from "./parts";
import InterviewSheet, { type SheetState } from "./InterviewSheet";
import {
  CHIP_LABELS,
  MODE_LABELS,
  OUTCOME_LABELS,
  SORT_OPTIONS,
  dayKeyOfDate,
  dayState,
  dayText,
  entriesByDay,
  fetchInterview,
  fetchInterviews,
  joinOffReason,
  joinUrl,
  monthGrid,
  monthLabel,
  roleSubtitle,
  shiftMonth,
  sortInterviews,
  whenText,
  type CalendarEntry,
  type CalendarState,
  type Fetched,
  type InterviewDetail,
  type InterviewRow,
  type InterviewsView,
  type Mode,
  type SortKey,
} from "@/lib/ent/consultant-ws/interviews";

/**
 * Consultant Interviews (design/enterprise-consultant/interviews.webp): one call to `GET /api/orgs/{orgId}/me-workspace/interviews` draws the
 * page for the signed-in consultant's OWN interviews; the side sheet reads `GET .../interviews/{id}` and writes the consultant's own join
 * details and feedback. Nothing here creates, moves or cancels an interview (the marketer or the client does that), and Join only opens a
 * link the consultant saved. Empty blocks say so in a sentence; there is no made-up number and nothing is marked sample.
 */

/* ── upcoming interviews table ──────────────────────────────────────────────────────── */

const MODE_ICON: Record<Mode, ComponentType<IconProps>> = { VIDEO: VideoIcon, ONSITE: MapPinIcon, PHONE: PhoneIcon };
const MODE_TONE: Record<Mode, string> = { VIDEO: "text-accent-deep", ONSITE: "text-v2-green-ink", PHONE: "text-v2-violet-ink" };

function ModeCell({ mode }: { mode: Mode | null }) {
  if (!mode) return <span className="text-[12.5px] text-muted">Not set</span>;
  const Icon = MODE_ICON[mode];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ink">
      <Icon size={15} className={MODE_TONE[mode]} />
      {MODE_LABELS[mode]}
    </span>
  );
}

const joinCls = "inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-lg px-3.5 text-[13px] font-semibold";

function JoinButton({ row, full }: { row: InterviewRow; full?: boolean }) {
  const url = joinUrl(row);
  if (url)
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" data-action="join" aria-label={`Join ${row.title} interview (opens in a new tab)`} className={cn(joinCls, "bg-accent text-paper hover:bg-accent-deep", full && "w-full")}>
        Join
      </a>
    );
  const why = joinOffReason(row);
  return (
    <button type="button" data-action="join" aria-disabled="true" title={why} aria-label={`Join ${row.title} interview: ${why}`} onClick={(e) => e.preventDefault()} className={cn(joinCls, "cursor-not-allowed bg-paper-2 text-muted", full && "w-full")}>
      Join
    </button>
  );
}

function UpcomingTable({ view, onOpen }: { view: InterviewsView; onOpen: (id: number, focusNote?: boolean) => void }) {
  const router = useRouter();
  const [sort, setSort] = useState<SortKey>("soonest");
  const rows = useMemo(() => sortInterviews(view.upcoming, sort), [view.upcoming, sort]);
  const hideSmall = "hidden 2xl:table-cell";
  return (
    <Card
      id="interviews-list"
      title="Upcoming interviews"
      icon={CalendarIcon}
      extra={
        <label className="ml-auto flex flex-none items-center gap-1.5 text-[12.5px] font-medium text-muted">
          <span className="hidden sm:inline">Sort by:</span>
          <span className="relative">
            <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="min-h-9 max-w-[180px] appearance-none rounded-lg border border-line bg-paper py-1 pl-3 pr-8 text-[13px] font-semibold text-ink">
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
          </span>
        </label>
      }
    >
      {rows.length === 0 ? (
        <Empty>No upcoming interviews. When your marketer or a client books one, it will appear here.</Empty>
      ) : (
        <div className="relative overflow-x-auto">
          <table className={cn(TABLE, "min-w-[700px] 2xl:min-w-[900px]")}>
            {/* Round and Mode only from 2xl: below it the card is too narrow and would clip the actions; both stay in the side sheet */}
            <thead>
              <tr className="text-left text-[12px] font-semibold text-muted">
                {["Role", "Company", "Round", "Interviewer", "Date & Time", "Mode", "Status", "Actions"].map((c) => (
                  <th key={c} scope="col" className={cn("whitespace-nowrap bg-paper-2/60 px-2 py-2 font-semibold first:rounded-l-lg last:rounded-r-lg", (c === "Round" || c === "Mode") && hideSmall)}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const when = whenText(r.scheduledAt, r.durationMinutes);
                const chip = r.chip ? CHIP_LABELS[r.chip] : null;
                return (
                  <tr key={r.id} data-interview={r.id}>
                    <td className={cn(TD, "max-w-[170px]")}>
                      <span className="block font-semibold">{r.title}</span>
                      {roleSubtitle(r) ? <span className="block text-[12px] text-muted">{roleSubtitle(r)}</span> : null}
                    </td>
                    <td className={TD}>
                      <span className="flex items-center gap-1.5">
                        <CompanyMark name={r.company} />
                        <span className="min-w-0 break-words">{r.company ?? "-"}</span>
                      </span>
                    </td>
                    <td className={cn(TD, hideSmall)}>{r.round ?? "-"}</td>
                    <td className={TD}>
                      <span className="block">{r.interviewerName ?? "-"}</span>
                      {r.interviewerTitle ? <span className="block text-[12px] text-muted">{r.interviewerTitle}</span> : null}
                    </td>
                    <td className={cn(TD, "whitespace-nowrap")}>
                      <span className="block">{when.date}</span>
                      <span className="block text-[12px] text-muted">{when.time}</span>
                    </td>
                    <td className={cn(TD, hideSmall)}>
                      <ModeCell mode={r.mode} />
                    </td>
                    <td className={TD}>{chip ? <Pill tone={chip.tone}>{chip.label}</Pill> : null}</td>
                    <td className={TD}>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <JoinButton row={r} />
                        <button type="button" data-action="view" aria-label={`View ${r.title} interview`} onClick={() => onOpen(r.id)} className={cn(joinCls, "border border-line bg-paper text-accent-deep hover:bg-accent-soft")}>
                          View
                        </button>
                        <Menu
                          trigger={
                            <button type="button" aria-label={`More actions for ${r.title}`} className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-paper-2">
                              <MoreVerticalIcon size={16} />
                            </button>
                          }
                          items={[
                            { label: "View details", icon: <CalendarIcon size={15} />, onSelect: () => onOpen(r.id) },
                            { label: "Add notes", icon: <PencilIcon size={15} />, onSelect: () => onOpen(r.id, true) },
                            { label: "Open preparation pack", icon: <BookOpenIcon size={15} />, onSelect: () => router.push(`${BASE}/interviews?tab=prepare`) },
                          ]}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ── calendar ───────────────────────────────────────────────────────────────────────── */

const DOT: Record<CalendarState, string> = { UPCOMING: "bg-accent", SCHEDULED: "bg-v2-amber-ink", COMPLETED: "bg-v2-green-ink", PAST: "bg-muted" };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const NAV_BTN = "grid h-9 w-9 flex-none place-items-center rounded-lg border border-line bg-paper text-ink hover:bg-paper-2";

function CalendarCard({ entries, onOpen }: { entries: CalendarEntry[]; onOpen: (id: number) => void }) {
  const [today] = useState(() => new Date());
  const todayKey = dayKeyOfDate(today);
  const [ym, setYm] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [focusKey, setFocusKey] = useState(todayKey);
  const [picked, setPicked] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const wantFocus = useRef(false);
  const byDay = useMemo(() => entriesByDay(entries), [entries]);
  const weeks = useMemo(() => monthGrid(ym.year, ym.month), [ym]);
  const label = monthLabel(ym.year, ym.month);
  const inMonth = (key: string) => weeks.some((w) => w.some((c) => c.key === key && c.inMonth));
  const tabKey = inMonth(focusKey) ? focusKey : (weeks[0].find((c) => c.inMonth)?.key ?? focusKey);

  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    refs.current.get(focusKey)?.focus();
  }, [focusKey, ym]);

  const go = (by: number) => setYm((v) => shiftMonth(v.year, v.month, by));
  const goToday = () => {
    setYm({ year: today.getFullYear(), month: today.getMonth() });
    setFocusKey(todayKey);
    setPicked(todayKey);
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    const at = (days: number) => new Date(y, m - 1, d + days);
    let next: Date | null = null;
    if (e.key === "ArrowLeft") next = at(-1);
    else if (e.key === "ArrowRight") next = at(1);
    else if (e.key === "ArrowUp") next = at(-7);
    else if (e.key === "ArrowDown") next = at(7);
    else if (e.key === "PageUp") next = new Date(y, m - 2, d);
    else if (e.key === "PageDown") next = new Date(y, m, d);
    else if (e.key === "Home") next = at(-new Date(y, m - 1, d).getDay());
    else if (e.key === "End") next = at(6 - new Date(y, m - 1, d).getDay());
    if (!next) return;
    e.preventDefault();
    wantFocus.current = true;
    setFocusKey(dayKeyOfDate(next));
    if (next.getMonth() !== ym.month || next.getFullYear() !== ym.year) setYm({ year: next.getFullYear(), month: next.getMonth() });
  };

  const dayEntries = picked ? (byDay.get(picked) ?? []) : [];
  return (
    <Card id="interviews-calendar" title="Interview calendar" icon={CalendarIcon}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Previous month" onClick={() => go(-1)} className={NAV_BTN}>
          <ChevronLeftIcon size={16} />
        </button>
        <p role="status" aria-live="polite" data-month className="flex min-h-9 min-w-[150px] flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-paper px-3 text-[14px] font-semibold text-ink">
          {label}
        </p>
        <button type="button" aria-label="Next month" onClick={() => go(1)} className={NAV_BTN}>
          <ChevronRightIcon size={16} />
        </button>
        <button type="button" onClick={goToday} className="min-h-9 rounded-lg border border-line bg-paper px-3.5 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft">
          Today
        </button>
      </div>
      <div role="grid" aria-label={`Interview calendar, ${label}`} className="mt-3 min-w-0">
        <div role="row" className="grid grid-cols-7 text-center text-[12px] font-semibold text-muted">
          {WEEKDAYS.map((w) => (
            <span key={w} role="columnheader" className="py-1.5">
              {w}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].key} role="row" className="grid grid-cols-7">
            {week.map((c) => {
              const list = byDay.get(c.key) ?? [];
              const state = dayState(list);
              const isToday = c.key === todayKey;
              const full = new Date(Number(c.key.slice(0, 4)), Number(c.key.slice(5, 7)) - 1, Number(c.key.slice(8))).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
              return (
                <span key={c.key} role="gridcell" aria-selected={picked === c.key} className="grid place-items-center py-0.5">
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) refs.current.set(c.key, el);
                      else refs.current.delete(c.key);
                    }}
                    tabIndex={c.key === tabKey ? 0 : -1}
                    data-day={c.key}
                    data-today={isToday || undefined}
                    data-state={state ?? undefined}
                    aria-label={`${full}${isToday ? ", today" : ""}${list.length ? `, ${list.length} interview${list.length === 1 ? "" : "s"}` : ""}`}
                    onClick={() => {
                      setFocusKey(c.key);
                      setPicked(c.key);
                    }}
                    onKeyDown={(e) => onKey(e, c.key)}
                    className={cn(
                      "relative grid h-9 w-9 place-items-center rounded-full text-[13px] font-medium tabular-nums",
                      c.inMonth ? "text-ink" : "text-muted/60",
                      isToday ? "bg-accent font-bold text-paper" : "hover:bg-paper-2",
                      picked === c.key && !isToday && "ring-2 ring-accent",
                    )}
                  >
                    {c.day}
                    {state ? <span aria-hidden className={cn("absolute bottom-0.5 h-1.5 w-1.5 rounded-full", isToday ? "bg-paper" : DOT[state])} /> : null}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <ul aria-label="Calendar key" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
        {(["UPCOMING", "SCHEDULED", "COMPLETED"] as const).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("h-2 w-2 rounded-full", DOT[s])} />
            {s === "UPCOMING" ? "Upcoming" : s === "SCHEDULED" ? "Scheduled later" : "Completed"}
          </li>
        ))}
      </ul>
      {picked ? (
        <div data-day-list className="mt-3 rounded-xl border border-line p-3" aria-live="polite">
          <p className="text-[13px] font-semibold text-ink">{dayText(`${picked}T12:00:00`)}</p>
          {dayEntries.length === 0 ? (
            <p className="mt-1 text-[12.5px] text-muted">No interviews on this day.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {dayEntries.map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-[13px]">
                  <span aria-hidden className={cn("h-2 w-2 flex-none rounded-full", DOT[e.state])} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{e.title}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {e.company ?? ""}
                      {e.company ? " - " : ""}
                      {new Date(e.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </span>
                  <button type="button" aria-label={`View ${e.title} interview`} onClick={() => onOpen(e.id)} className="inline-flex min-h-8 flex-none items-center rounded-lg border border-line bg-paper px-3 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft">
                    View
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </Card>
  );
}

/* ── recent feedback ────────────────────────────────────────────────────────────────── */

function FeedbackCard({ view, onOpen }: { view: InterviewsView; onOpen: (id: number) => void }) {
  return (
    <Card id="interviews-feedback" title="Recent interview feedback" icon={FileTextIcon}>
      {view.feedback.length === 0 ? (
        <Empty>No feedback recorded yet. After an interview, note how it went and it will appear here.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {view.feedback.map((f) => {
            const o = OUTCOME_LABELS[f.outcome];
            return (
              <li key={f.interviewId} data-feedback={f.interviewId} className="flex flex-wrap items-start gap-3 py-3 first:pt-0 sm:flex-nowrap">
                <span aria-hidden className="mt-0.5 hidden flex-none sm:block">
                  <CompanyMark name={f.company} tone={1} />
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
                    <span className="font-bold text-ink">{f.title}</span>
                    <span className="text-[12.5px] text-muted">{dayText(f.interviewedAt)}</span>
                    <Pill tone={o.tone} className="min-h-5 text-[11.5px]">
                      {o.label}
                    </Pill>
                  </p>
                  {f.company ? <p className="text-[12.5px] text-muted">{f.company}</p> : null}
                  <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-ink-soft">{f.summary}</p>
                </div>
                <button type="button" aria-label={`View details of feedback for ${f.title}`} onClick={() => onOpen(f.interviewId)} className="inline-flex min-h-8 flex-none items-center whitespace-nowrap rounded-lg border border-line bg-paper px-3 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft">
                  View Details
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {view.pendingFeedback.length > 0 ? (
        <div data-pending-feedback className="mt-3 rounded-xl border border-dashed border-line p-3">
          <p className="text-[13px] font-semibold text-ink">Waiting for your feedback</p>
          <ul className="mt-2 space-y-2">
            {view.pendingFeedback.map((p) => (
              <li key={p.interviewId} className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{p.title}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {p.company ? `${p.company} - ` : ""}
                    {dayText(p.interviewedAt)}
                  </span>
                </span>
                <button type="button" aria-label={`Add feedback for ${p.title}`} onClick={() => onOpen(p.interviewId)} className="inline-flex min-h-8 flex-none items-center rounded-lg bg-accent-soft px-3 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft/70">
                  Add feedback
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

export interface InterviewsPageProps {
  orgId: number;
  /** Not used any more (the help card is gone); the route still passes it. */
  firstName?: string;
}

type SheetData = { id: number; result: Fetched<InterviewDetail> } | null;

function InterviewSchedule({ orgId }: InterviewsPageProps) {
  const { view, status, reload } = useWorkspaceData(useCallback(() => fetchInterviews(orgId), [orgId]));
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [sheetData, setSheetData] = useState<SheetData>(null);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  const sheetId = sheet?.id ?? null;

  useEffect(() => {
    if (sheetId === null) return;
    const ctl = new AbortController();
    void fetchInterview(orgId, sheetId, ctl.signal).then((result) => {
      if (!ctl.signal.aborted) setSheetData({ id: sheetId, result });
    });
    return () => ctl.abort();
  }, [orgId, sheetId, attempt]);

  const open = (id: number, focusNote?: boolean) => {
    setSheetData(null);
    setSheet({ id, focusNote });
  };
  const close = () => setSheet(null);

  if (status === "denied") return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  const current = sheetData && sheetData.id === sheetId ? sheetData.result : null;
  const detail = current?.kind === "OK" && current.view ? current.view : null;

  return (
    <div data-consultant-interviews data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <p role="status" aria-live="polite" data-notice className={cn("rounded-lg bg-v2-green-soft px-3 py-2 text-[13px] font-medium text-v2-green-ink", !notice && "sr-only hidden")}>
        {notice}
      </p>

      {status === "failed" ? (
        <ErrorState what="your interviews" description="Your interviews didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:gap-5">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5">
            {view ? (
              <>
                <UpcomingTable view={view} onOpen={open} />
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <CalendarCard entries={view.calendar} onOpen={open} />
                  <FeedbackCard view={view} onOpen={open} />
                </div>
              </>
            ) : (
              <div className="grid gap-4" aria-busy="true">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-56 w-full" />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <InterviewSheet
        open={sheet !== null}
        orgId={orgId}
        state={sheet}
        detail={detail}
        loading={sheet !== null && current === null}
        onClose={close}
        onRetry={() => {
          setSheetData(null);
          setAttempt((n) => n + 1);
        }}
        onSaved={(message, saved) => {
          setNotice(message);
          if (saved && sheetId !== null) setSheetData({ id: sheetId, result: { kind: "OK", view: saved } });
          void reload();
        }}
      />
    </div>
  );
}

/* ── the page: Schedule | Prepare ───────────────────────────────────────────────────── */

const TABS = ["schedule", "prepare"] as const;
const TAB_LABELS = [
  { value: "schedule", label: "Schedule" },
  { value: "prepare", label: "Prepare" },
] as const;

/** Consultant Interviews (UI refresh Phase 1, s6): the schedule and the preparation as two tabs of one page, chosen by `?tab=prepare`. */
export default function ConsultantInterviewsPage(props: InterviewsPageProps) {
  const [tab, setTab] = useUrlTab(TABS, "schedule");
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="Interviews" subtitle="Your interviews, and how to get ready for them." />
      <PageTabs label="Interviews views" tabs={TAB_LABELS} value={tab} onChange={setTab} />
      {tab === "prepare" ? <ConsultantInterviewPrepPage orgId={props.orgId} /> : <InterviewSchedule {...props} />}
    </div>
  );
}
