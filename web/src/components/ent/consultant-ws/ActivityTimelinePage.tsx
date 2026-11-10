"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ComponentType } from "react";
import {
  ArrowUpRightIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClipboardCheckIcon,
  ClockIcon,
  DownloadIcon,
  ErrorState,
  FileTextIcon,
  HandshakeIcon,
  ListIcon,
  MessageIcon,
  MoreVerticalIcon,
  Menu,
  SendIcon,
  Skeleton,
  TargetIcon,
  TrophyIcon,
  UploadIcon,
  UserIcon,
  UsersIcon,
  VideoIcon,
  XCircleIcon,
  cn,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { CARD, TONES, type IconTone } from "@/components/ent/dashboard/parts";
import { BASE, Card, CompanyMark, Empty, SampleMark, useWorkspaceData } from "./parts";
import { type Tone } from "@/lib/ent/consultant-ws/home";
import {
  EMPTY_QUERY,
  PERIODS,
  TYPE_OPTIONS,
  chipDate,
  dayHeading,
  dotTone,
  fetchTimeline,
  groupByDay,
  hrefFor,
  mergeEvents,
  milestoneDate,
  rangeLabel,
  timeLabel,
  timelineCsv,
  dayLabel,
  type TimelineChip,
  type TimelineEvent,
  type TimelineQuery,
  type TimelineView,
} from "@/lib/ent/consultant-ws/activityTimeline";

/**
 * Activity Timeline (design/enterprise-consultant/activity-timeline.webp): one call to `GET /api/orgs/{orgId}/me-workspace/activity-timeline`
 * (through the BFF) draws the page for the signed-in consultant's OWN events, merged and sorted by the API. The page is read-only: every row
 * links to the page that owns the event, "Load more" follows the API's cursor, and "Export Timeline" turns the rows already on screen into a
 * CSV in the browser (nothing is sent anywhere). The board's "Marketer Note" type only appears when a real submission carries a marketer note.
 */

/* ── one row ────────────────────────────────────────────────────────────────────────── */

const TYPE_ICON: Record<string, { icon: ComponentType<IconProps>; tone: IconTone }> = {
  RESUME_UPDATED: { icon: FileTextIcon, tone: "accent" },
  RESUME_ADDED: { icon: FileTextIcon, tone: "accent" },
  RESUME_SHARED: { icon: SendIcon, tone: "accent" },
  RESUME_DOWNLOADED: { icon: DownloadIcon, tone: "accent" },
  JOB_ASSIGNED: { icon: BriefcaseIcon, tone: "green" },
  JOB_RESPONDED: { icon: ClipboardCheckIcon, tone: "green" },
  APPLICATION_CREATED: { icon: ClipboardCheckIcon, tone: "violet" },
  APPLICATION_SUBMITTED: { icon: UploadIcon, tone: "violet" },
  APPLICATION_UPDATED: { icon: ClipboardCheckIcon, tone: "violet" },
  SUBMISSION_APPROVED: { icon: CheckCircleIcon, tone: "green" },
  SUBMISSION_DECLINED: { icon: XCircleIcon, tone: "coral" },
  SUBMISSION_SENT: { icon: SendIcon, tone: "green" },
  MARKETER_NOTE: { icon: UserIcon, tone: "coral" },
  INTERVIEW_SCHEDULED: { icon: VideoIcon, tone: "amber" },
  INTERVIEW_COMPLETED: { icon: CheckCircleIcon, tone: "amber" },
  FEEDBACK_RECEIVED: { icon: MessageIcon, tone: "violet" },
  OFFER_RECEIVED: { icon: TrophyIcon, tone: "amber" },
  OFFER_UPDATED: { icon: TrophyIcon, tone: "amber" },
  OFFER_NEGOTIATING: { icon: UsersIcon, tone: "amber" },
  OFFER_ACCEPTED: { icon: TrophyIcon, tone: "green" },
  OFFER_DECLINED: { icon: XCircleIcon, tone: "coral" },
  AVAILABILITY_UPDATED: { icon: CalendarIcon, tone: "accent" },
  PROFILE_UPDATED: { icon: ListIcon, tone: "accent" },
  PLACEMENT_MILESTONE: { icon: HandshakeIcon, tone: "green" },
};
const FALLBACK_ICON = { icon: ClockIcon, tone: "accent" as IconTone };

const DOT_TEXT: Record<Tone, string> = {
  blue: "text-accent-deep",
  green: "text-v2-green-ink",
  amber: "text-v2-amber-ink",
  red: "text-v2-coral-ink",
  violet: "text-v2-violet-ink",
  slate: "text-muted",
};

const CHIP_BOX = "flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl bg-paper-2/70 px-3 py-1.5";

function Chip({ chip }: { chip: TimelineChip | null }) {
  if (!chip) return null;
  if (chip.kind === "JOB") {
    return (
      <span data-chip="JOB" className={CHIP_BOX}>
        <CompanyMark name={chip.company ?? chip.primary} />
        <span className="min-w-0 text-[12.5px] leading-tight">
          <span className="block break-words font-semibold text-ink">{chip.primary}</span>
          {chip.secondary ? <span className="block break-words text-muted">{chip.secondary}</span> : null}
        </span>
      </span>
    );
  }
  if (chip.kind === "DATES") {
    const r = rangeLabel(chip.from, chip.to);
    return r ? (
      <span data-chip="DATES" className={CHIP_BOX}>
        <CalendarIcon size={18} className="flex-none text-v2-coral-ink" />
        <span className="min-w-0 text-[12.5px] leading-tight">
          <span className="block font-semibold text-ink">{r.day}</span>
          <span className="block text-muted">{r.time}</span>
        </span>
      </span>
    ) : null;
  }
  const Icon = chip.kind === "FILE" ? FileTextIcon : chip.kind === "AVAILABILITY" ? CalendarIcon : ListIcon;
  return (
    <span data-chip={chip.kind} className={CHIP_BOX}>
      <Icon size={18} className="flex-none text-accent-deep" />
      <span className="min-w-0 text-[12.5px] leading-tight">
        <span className="block break-words font-semibold text-ink">{chip.primary}</span>
        {chip.secondary ? <span className="block break-words text-muted">{chip.kind === "AVAILABILITY" ? chipDate(chip.secondary) : chip.secondary}</span> : null}
      </span>
    </span>
  );
}

function Row({ e, first, onGo }: { e: TimelineEvent; first: boolean; onGo: (href: string) => void }) {
  const spec = TYPE_ICON[e.type] ?? FALLBACK_ICON;
  const Icon = spec.icon;
  const href = hrefFor(BASE, e);
  return (
    <li data-timeline-row={e.type} data-event-key={e.key} className="relative grid grid-cols-[minmax(0,1fr)] gap-x-3 gap-y-2 border-t border-line/70 py-3 first:border-t-0 sm:grid-cols-[84px_minmax(0,1fr)] xl:grid-cols-[96px_minmax(0,1fr)_minmax(0,200px)_auto]">
      <div className="min-w-0 text-[12.5px] leading-tight text-muted sm:pt-1 sm:pl-0">
        {first ? <p className="font-semibold text-ink">{dayLabel(e.at)}</p> : null}
        <p>{timeLabel(e.at)}</p>
      </div>
      <div className="relative flex min-w-0 items-start gap-3 sm:pl-5">
        <span aria-hidden className={cn("absolute left-0 top-4 hidden h-2.5 w-2.5 rounded-full bg-current ring-4 ring-paper sm:block", DOT_TEXT[dotTone(e)])} />
        <span aria-hidden className={cn("grid h-11 w-11 flex-none place-items-center rounded-xl", TONES[spec.tone])}>
          <Icon size={21} />
        </span>
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-[14.5px] font-bold leading-tight text-ink">
            {e.title}
            {e.sample ? <SampleMark /> : null}
          </h3>
          <p className="mt-0.5 break-words text-[13px] leading-snug text-muted">{e.description}</p>
        </div>
      </div>
      <div className="min-w-0 sm:col-start-2 xl:col-start-auto">
        <Chip chip={e.chip} />
      </div>
      <div className="flex items-center gap-1 sm:col-start-2 xl:col-start-auto">
        <Link href={href} className="inline-flex min-h-9 items-center whitespace-nowrap rounded-lg border border-line bg-paper px-3.5 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft">
          {e.actionLabel}
        </Link>
        <Menu
          trigger={
            <button type="button" aria-label={`More actions for ${e.title}`} className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-paper-2">
              <MoreVerticalIcon size={16} />
            </button>
          }
          items={[
            { label: e.actionLabel, icon: <ArrowUpRightIcon size={15} />, onSelect: () => onGo(href) },
            { label: "Ask my marketer", icon: <MessageIcon size={15} />, onSelect: () => onGo(`${BASE}/marketer`) },
          ]}
        />
      </div>
    </li>
  );
}

/* ── the timeline card ──────────────────────────────────────────────────────────────── */

const selectCls = "min-h-10 w-full appearance-none rounded-lg border border-line bg-paper py-1 pl-3 pr-8 text-[13px] font-semibold text-ink";

function PillSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <span className="relative block min-w-0">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
    </span>
  );
}

function TimelineCard({
  view,
  shown,
  query,
  onQuery,
  hasMore,
  loadingMore,
  moreFailed,
  onMore,
  refreshing,
  onGo,
}: {
  view: TimelineView;
  shown: TimelineEvent[];
  query: TimelineQuery;
  onQuery: (q: TimelineQuery) => void;
  hasMore: boolean;
  loadingMore: boolean;
  moreFailed: boolean;
  onMore: () => void;
  refreshing: boolean;
  onGo: (href: string) => void;
}) {
  const groups = useMemo(() => groupByDay(shown), [shown]);
  const [now] = useState(() => Date.now());
  return (
    <section aria-labelledby="timeline-title" data-home-card="timeline" aria-busy={refreshing} className={cn(CARD, "flex min-w-0 flex-col p-4 sm:p-5")}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-full", TONES.accent)}>
          <ClockIcon size={19} />
        </span>
        <h2 id="timeline-title" className="min-w-0 flex-1 text-[19px] font-extrabold leading-tight text-ink">
          Activity Timeline
        </h2>
        <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
          <PillSelect label="Activity type" value={query.type} onChange={(v) => onQuery({ ...query, type: v })} options={TYPE_OPTIONS} />
          <PillSelect label="Period" value={String(query.days)} onChange={(v) => onQuery({ ...query, days: Number(v) })} options={PERIODS.map((p) => ({ value: String(p.value), label: p.label }))} />
        </div>
      </header>

      <div className="mt-3 min-w-0">
        {shown.length === 0 ? (
          <Empty>{query.type === "ALL" ? `No activity in the last ${view.days} days. Try a longer period.` : "No activity of this type in this period. Try another type or a longer period."}</Empty>
        ) : (
          groups.map((g) => (
            <div key={g.day} data-day-group={g.day} className="min-w-0">
              <h3 className="mt-2 rounded-lg bg-paper-2/60 px-3 py-1.5 text-[12px] font-bold uppercase tracking-wide text-muted">{dayHeading(g.events[0].at, now)}</h3>
              <ul className="min-w-0">
                {g.events.map((e, i) => (
                  <Row key={e.key} e={e} first={i === 0} onGo={onGo} />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      {shown.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
          <p data-timeline-count>
            Showing {shown.length} of {view.total}
          </p>
          {hasMore ? (
            <button
              type="button"
              data-load-more
              disabled={loadingMore}
              onClick={onMore}
              className="inline-flex min-h-10 items-center rounded-xl border border-line bg-paper px-4 text-[13.5px] font-semibold text-accent-deep hover:bg-accent-soft disabled:opacity-60"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          ) : null}
        </div>
      ) : null}
      {moreFailed ? (
        <p role="alert" className="mt-2 text-[12.5px] text-v2-coral-ink">
          More activity didn&apos;t load. Nothing has changed, try again.
        </p>
      ) : null}
    </section>
  );
}

function Milestones({ view }: { view: TimelineView }) {
  return (
    <Card id="timeline-milestones" title="Recent milestones" icon={TargetIcon}>
      <ul className="grid gap-2.5">
        {view.milestones.map((m) => (
          <li key={m.key} data-milestone={m.key} data-reached={m.reached} className="flex items-center gap-2.5 text-[13.5px]">
            {m.reached ? <CheckCircleIcon size={20} className="flex-none text-v2-green-ink" /> : <span aria-hidden className="h-5 w-5 flex-none rounded-full border-2 border-line" />}
            <span className={cn("min-w-0 flex-1 break-words font-medium", m.reached ? "text-ink" : "text-muted")}>{m.label}</span>
            <span className="flex-none text-[12.5px] text-muted">
              {m.reached ? "" : <span className="sr-only">Not reached yet. </span>}
              {milestoneDate(m)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

export interface ActivityTimelinePageProps {
  orgId: number;
}

interface Extra {
  key: string;
  events: TimelineEvent[];
  cursor: string | null;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ActivityTimelinePage({ orgId }: ActivityTimelinePageProps) {
  const router = useRouter();
  const [query, setQuery] = useState<TimelineQuery>(EMPTY_QUERY);
  const { view, status, reload } = useWorkspaceData(useCallback(() => fetchTimeline(orgId, query), [orgId, query]));
  const [extra, setExtra] = useState<Extra | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  // the pages after the first belong to one answer (its time, type and period); a new answer starts again from its own first page
  const viewKey = view ? `${view.generatedAt}|${view.type}|${view.days}` : "";
  const more = view && extra && extra.key === viewKey ? extra : null;
  const shown = useMemo(() => (view ? mergeEvents(view.events, more?.events ?? []) : []), [view, more]);
  const cursor = view ? (more ? more.cursor : view.nextCursor) : null;
  const stale = view !== null && (view.type !== query.type || view.days !== query.days);

  const loadMore = async () => {
    if (!view || !cursor || loadingMore) return;
    setLoadingMore(true);
    setMoreFailed(false);
    const r = await fetchTimeline(orgId, { type: view.type, days: view.days }, cursor);
    if (r.kind === "OK" && r.view) setExtra({ key: viewKey, events: mergeEvents(more?.events ?? [], r.view.events), cursor: r.view.nextCursor });
    else setMoreFailed(true);
    setLoadingMore(false);
  };

  const exportCsv = () => {
    if (shown.length > 0) download("activity-timeline.csv", timelineCsv(shown));
  };

  if (status === "denied") return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  return (
    <div data-consultant-activity-timeline data-status={status} className="flex flex-col gap-4 sm:gap-5">
      {status === "failed" ? (
        <ErrorState what="your activity timeline" description="Your timeline didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <>
          <div className="flex justify-end">
            <button type="button" data-export disabled={shown.length === 0} onClick={exportCsv} title={shown.length > 0 ? undefined : "Nothing loaded to export yet"} className="inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-paper px-3.5 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60">
              Export timeline
            </button>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:gap-5">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5">
              {view ? (
                <>
                  <TimelineCard
                    view={view}
                    shown={shown}
                    query={query}
                    onQuery={(q) => {
                      setMoreFailed(false);
                      setQuery(q);
                    }}
                    hasMore={cursor !== null}
                    loadingMore={loadingMore}
                    moreFailed={moreFailed}
                    onMore={() => void loadMore()}
                    refreshing={stale}
                    onGo={(href) => router.push(href)}
                  />
                  <Milestones view={view} />
                </>
              ) : (
                <div className="grid gap-4" aria-busy="true">
                  <Skeleton className="h-96 w-full" />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
