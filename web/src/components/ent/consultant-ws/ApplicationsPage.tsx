"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import {
  Button,
  CalendarCheckIcon,
  CalendarIcon,
  ChatIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  ErrorState,
  FileTextIcon,
  FunnelIcon,
  MoreVerticalIcon,
  Menu,
  SideSheet,
  Skeleton,
  Sparkline,
  TrophyIcon,
  VideoIcon,
  XCircleIcon,
  ZapIcon,
  chartColor,
  cn,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { TONES, type IconTone } from "@/components/ent/dashboard/parts";
import PageHeader, { ClaimsHelpCard, ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { BASE, BeeCard, Card, CompanyMark, Empty, Pill, TABLE, TD, useWorkspaceData } from "./parts";
import { deltaText, firstName } from "@/lib/ent/consultant-ws/home";
import InboxUndo from "@/components/inbox/InboxUndo";
import { reviewEndpoints } from "@/lib/ent/consultant-ws/inbox";
import { actorLine, type Viewer } from "@/lib/actors";
import { RelationTag } from "@/components/app-v3/applications/UpdatedBy";
import { UpdatedMeta, seatViewer } from "@/components/ent/applications/changeAudit";
import {
  ACTOR_LABELS,
  DEFAULT_QUERY,
  FUNNEL_LABELS,
  SORT_OPTIONS,
  barWidth,
  fetchApplications,
  fetchDetail,
  formatDate,
  formatTime,
  nextStep,
  percentText,
  sourceBadge,
  stageLabel,
  statusLabel,
  updateText,
  type AppDetail,
  type AppRow,
  type AppTile,
  type ApplicationsView,
  type Fetched,
  type FunnelKey,
  type ListQuery,
  type SortKey,
} from "@/lib/ent/consultant-ws/applications";

/**
 * Consultant My Applications (design/enterprise-consultant/applications.webp): one call to
 * `GET /api/orgs/{orgId}/me-workspace/applications?status=&sort=&page=` draws the page for the signed-in consultant's OWN applications;
 * the status filter, the sort and the paging all run in the API. The page is read-only: the marketer prepares and the consultant submits
 * outside Kiwiply, so there is nothing to edit and no submit button. Empty blocks say so in a sentence; there is no made-up number.
 */

/* ── tiles ──────────────────────────────────────────────────────────────────────────── */

interface TileSpec {
  key: keyof ApplicationsView["tiles"];
  title: string;
  icon: ComponentType<IconProps>;
  tone: IconTone;
  /** More of this is not good news (rejections), so a rise is drawn in the warning colour. */
  worseUp?: boolean;
}
const TILE_SPECS: TileSpec[] = [
  { key: "total", title: "Total Applications", icon: FileTextIcon, tone: "accent" },
  { key: "underReview", title: "Under Review", icon: ClockIcon, tone: "accent" },
  { key: "interviews", title: "Interviews Scheduled", icon: CalendarIcon, tone: "violet" },
  { key: "rejected", title: "Rejected", icon: XCircleIcon, tone: "coral", worseUp: true },
  { key: "offers", title: "Offers", icon: TrophyIcon, tone: "amber" },
];

function Tile({ spec, tile, index }: { spec: TileSpec; tile: AppTile | null; index: number }) {
  const Icon = spec.icon;
  const d = tile ? deltaText(tile.deltaPct) : null;
  const good = d ? (d.dir === "flat" ? null : (d.dir === "up") !== !!spec.worseUp) : null;
  return (
    <section aria-label={spec.title} data-stat-tile={spec.key} data-tone={spec.tone} data-state={tile ? "ok" : "loading"} className="flex min-h-[112px] min-w-0 gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-3.5">
      <span aria-hidden className={cn("grid h-11 w-11 flex-none place-items-center rounded-[12px]", TONES[spec.tone])}>
        <Icon size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13px] font-semibold leading-tight text-ink">{spec.title}</h3>
        {tile ? (
          <>
            <div className="mt-1 flex items-end justify-between gap-2">
              <p data-tile-value className="text-[28px] font-extrabold leading-none tabular-nums text-ink">
                {tile.value}
              </p>
              {tile.sparkline.length > 1 ? (
                <div className="mb-0.5 w-[42%] max-w-[72px] flex-none">
                  <Sparkline values={tile.sparkline} color={chartColor(index)} />
                </div>
              ) : null}
            </div>
            <p className="mt-2 flex min-h-5 flex-wrap items-center gap-x-1.5 text-[12px] text-muted">
              {d ? (
                <>
                  <span data-delta={d.dir} className={cn("font-bold", good === null ? "text-muted" : good ? "text-v2-green-ink" : "text-v2-coral-ink")}>
                    {d.dir === "up" ? "↑" : d.dir === "down" ? "↓" : "→"} {d.text}
                  </span>
                  <span>vs last month</span>
                </>
              ) : (
                <span>No change to compare yet</span>
              )}
            </p>
          </>
        ) : (
          <>
            <Skeleton className="mt-2 h-8 w-16" />
            <Skeleton className="mt-2 h-4 w-24" />
          </>
        )}
      </div>
    </section>
  );
}

/* ── the applications table ─────────────────────────────────────────────────────────── */

interface RowActions {
  open: (r: AppRow) => void;
  go: (href: string) => void;
}

const selectCls = "min-h-9 appearance-none rounded-lg border border-line bg-paper py-1 pl-3 pr-8 text-[13px] font-semibold text-ink";

function Applications({ view, query, onQuery, a, busy }: { view: ApplicationsView; query: ListQuery; onQuery: (q: ListQuery) => void; a: RowActions; busy: boolean }) {
  const { paging } = view;
  const from = paging.total === 0 ? 0 : paging.page * paging.size + 1;
  const to = Math.min(paging.total, (paging.page + 1) * paging.size);
  const filtered = query.status !== "ALL";
  return (
    <Card
      id="applications-list"
      title="My Applications"
      icon={FileTextIcon}
      extra={
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <span className="relative">
            <select aria-label="Filter by status" value={query.status} onChange={(e) => onQuery({ ...query, status: e.target.value, page: 0 })} className={selectCls}>
              {view.statuses.map((o) => (
                <option key={o.key} value={o.key}>
                  {statusLabel(o.key)} ({o.count})
                </option>
              ))}
              {!view.statuses.some((o) => o.key === query.status) ? <option value={query.status}>{statusLabel(query.status)}</option> : null}
            </select>
            <ChevronDownIcon size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
          </span>
          <span className="relative">
            <select aria-label="Sort by" value={query.sort} onChange={(e) => onQuery({ ...query, sort: e.target.value as SortKey, page: 0 })} className={selectCls}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  Sort by: {o.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
          </span>
        </div>
      }
    >
      {view.rows.length === 0 ? (
        <Empty>
          {filtered
            ? `No applications are ${statusLabel(query.status).toLowerCase()} right now.`
            : "No applications yet. Your marketer prepares them with you; once one is on its way it will show up here with its stage and next step."}
        </Empty>
      ) : (
        <div className={cn("overflow-x-auto", busy && "opacity-70")} aria-busy={busy}>
          <table className={cn(TABLE, "min-w-[620px] 2xl:min-w-[860px]")}>
            {/* Submission Source only from 2xl: below it the card is too narrow and would clip the actions (it is in the details sheet) */}
            <thead>
              <tr className="text-left text-[12px] font-semibold text-muted">
                {["Company", "Role", "Applied Date", "Submission Source", "Current Stage", "Next Step", "Actions"].map((c) => (
                  <th key={c} scope="col" className={cn("whitespace-nowrap bg-paper-2/60 px-2.5 py-2 font-semibold first:rounded-l-lg last:rounded-r-lg", c === "Submission Source" && "hidden 2xl:table-cell")}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {view.rows.map((r) => {
                const st = stageLabel(r.stage, r.closedReason);
                const src = sourceBadge(r.source);
                const nx = nextStep(r);
                const label = `${r.title ?? "application"} at ${r.company ?? "the company"}`;
                return (
                  <tr key={r.applicationId} data-application={r.applicationId}>
                    <td className={TD}>
                      <span className="flex items-center gap-2 font-semibold">
                        <CompanyMark name={r.company} />
                        <span className="min-w-0 max-w-[120px] truncate">{r.company ?? "-"}</span>
                      </span>
                    </td>
                    <td className={cn(TD, "max-w-[160px] text-ink-soft")}>{r.title ?? "-"}</td>
                    <td className={cn(TD, "whitespace-nowrap text-ink-soft")}>{formatDate(r.appliedOn) || "-"}</td>
                    <td className={cn(TD, "hidden 2xl:table-cell")}>{src ? <Pill tone={src.tone}>{src.label}</Pill> : <span className="text-muted">-</span>}</td>
                    <td className={TD}>
                      <Pill tone={st.tone} data-stage={r.stage}>
                        {st.label}
                      </Pill>
                    </td>
                    <td className={cn(TD, "text-[12.5px] leading-snug text-ink-soft")}>
                      {nx ? (
                        <>
                          <span className="block text-ink">{nx.action}</span>
                          {nx.due ? <span className="block text-muted">{nx.due}</span> : null}
                        </>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className={TD}>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <button type="button" data-action="view" aria-label={`View ${label}`} onClick={() => a.open(r)} className="inline-flex min-h-8 items-center whitespace-nowrap rounded-lg border border-line bg-paper px-3.5 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft">
                          View
                        </button>
                        <Menu
                          trigger={
                            <button type="button" aria-label={`More actions for ${label}`} className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-paper-2">
                              <MoreVerticalIcon size={16} />
                            </button>
                          }
                          items={[
                            { label: "View details", icon: <FileTextIcon size={15} />, onSelect: () => a.open(r) },
                            { label: "Ask my marketer", icon: <ChatIcon size={15} />, onSelect: () => a.go(`${BASE}/marketer`) },
                            { label: "Prepare for interview", icon: <VideoIcon size={15} />, disabled: r.stage !== "INTERVIEWING", onSelect: () => a.go(`${BASE}/interview-prep`) },
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
      {paging.pages > 1 ? (
        <nav aria-label="Applications pages" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
          <span data-range>
            Showing {from}-{to} of {paging.total}
          </span>
          <span className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={paging.page <= 0 || busy} onClick={() => onQuery({ ...query, page: paging.page - 1 })}>
              Previous
            </Button>
            <span className="tabular-nums">
              Page {paging.page + 1} of {paging.pages}
            </span>
            <Button variant="ghost" size="sm" disabled={paging.page >= paging.pages - 1 || busy} onClick={() => onQuery({ ...query, page: paging.page + 1 })}>
              Next
            </Button>
          </span>
        </nav>
      ) : null}
    </Card>
  );
}

/* ── pipeline summary (plain CSS bars) ──────────────────────────────────────────────── */

const FUNNEL_BAR: Record<FunnelKey, string> = {
  TOTAL: "bg-accent",
  UNDER_REVIEW: "bg-accent/60",
  INTERVIEWING: "bg-v2-violet-ink/60",
  OFFER: "bg-v2-green-ink/60",
  REJECTED: "bg-v2-coral-ink/60",
};

function PipelineSummary({ view }: { view: ApplicationsView }) {
  const total = view.funnel.find((s) => s.key === "TOTAL")?.count ?? 0;
  return (
    <Card id="applications-funnel" title="Application Pipeline Summary" icon={FunnelIcon}>
      {total === 0 ? (
        <Empty>Nothing in your pipeline yet. Applications will be counted here as they move along.</Empty>
      ) : (
        <ul className="space-y-2" aria-label="Pipeline steps">
          {view.funnel.map((s) => (
            <li key={s.key} data-funnel={s.key} className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)_4.6rem] items-center gap-2 text-[13px] sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)_5rem]">
              <span className="leading-tight text-ink-soft">{FUNNEL_LABELS[s.key]}</span>
              <span role="img" aria-label={`${FUNNEL_LABELS[s.key]}: ${s.count}`} className="flex h-7 items-center justify-center">
                {s.count > 0 ? (
                  <span className={cn("block h-full", FUNNEL_BAR[s.key])} style={{ width: `${barWidth(s.count, total)}%`, clipPath: "polygon(0 0, 100% 0, 92% 100%, 8% 100%)" }} />
                ) : (
                  <span className="block h-0.5 w-6 rounded-full bg-line" />
                )}
              </span>
              <span className="whitespace-nowrap text-right font-semibold tabular-nums text-ink">
                {s.count}
                {s.key !== "TOTAL" && s.percent !== null ? <span className="ml-1 font-normal text-muted">({percentText(s.percent)})</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11.5px] text-muted">Shares are of all your applications; closed ones other than rejected are only in the total.</p>
    </Card>
  );
}

/* ── recent status updates ──────────────────────────────────────────────────────────── */

const UPDATE_TONE: Record<string, { icon: ComponentType<IconProps>; chip: string; title: string }> = {
  blue: { icon: ClockIcon, chip: "bg-accent-soft text-accent-deep", title: "text-ink" },
  violet: { icon: CalendarIcon, chip: "bg-v2-violet-soft text-v2-violet-ink", title: "text-ink" },
  green: { icon: TrophyIcon, chip: "bg-v2-green-soft text-v2-green-ink", title: "text-v2-green-ink" },
  red: { icon: XCircleIcon, chip: "bg-v2-coral-soft text-v2-coral-ink", title: "text-v2-coral-ink" },
  slate: { icon: FileTextIcon, chip: "bg-paper-2 text-ink-soft", title: "text-ink" },
};

function RecentUpdates({ view }: { view: ApplicationsView }) {
  return (
    <Card id="applications-recent" title="Recent Status Updates" icon={ClockIcon}>
      {view.recent.length === 0 ? (
        <Empty>No status updates yet. Stage changes on your applications will show up here.</Empty>
      ) : (
        <ol className="space-y-3">
          {view.recent.map((u) => {
            const t = updateText(u);
            const tone = UPDATE_TONE[t.tone];
            const Icon = tone.icon;
            return (
              <li key={u.id} data-update={u.toStage} className="flex items-start gap-2.5">
                <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-full", tone.chip)}>
                  <Icon size={17} />
                </span>
                <span className="min-w-0 flex-1 text-[13px] leading-snug">
                  <span className={cn("block font-bold", tone.title)}>{t.title}</span>
                  <span className="block text-ink-soft">{t.body}</span>
                  <span className="block text-[11.5px] text-muted">By {ACTOR_LABELS[u.by].toLowerCase()}</span>
                </span>
                <span className="flex-none text-right text-[11.5px] leading-snug text-muted">
                  <span className="block whitespace-nowrap">{formatDate(u.at)}</span>
                  <span className="block whitespace-nowrap">{formatTime(u.at)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

/* ── the right rail ─────────────────────────────────────────────────────────────────── */

const QUICK: { key: string; label: string; hint: string; icon: ComponentType<IconProps>; href: string | null }[] = [
  { key: "view-application", label: "View Application", hint: "Check the latest status and details", icon: FileTextIcon, href: null },
  { key: "update-availability", label: "Update Availability", hint: "Keep your availability up to date", icon: CalendarCheckIcon, href: `${BASE}/profile` },
  { key: "ask-marketer", label: "Ask Marketer", hint: "Get guidance from your marketer", icon: ChatIcon, href: `${BASE}/marketer` },
  { key: "prepare-interview", label: "Prepare for Interview", hint: "Access resources and practice", icon: VideoIcon, href: `${BASE}/interview-prep` },
];

const QUICK_CLS = "flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-line bg-paper p-2.5 text-left hover:bg-paper-2/60";

function QuickActions({ onView, canView }: { onView: () => void; canView: boolean }) {
  return (
    <Card id="applications-quick" title="Quick Actions" icon={ZapIcon}>
      <ul className="space-y-2.5">
        {QUICK.map((q) => {
          const Icon = q.icon;
          const body = (
            <>
              <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-accent-soft text-accent-deep">
                <Icon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-bold leading-tight text-ink">{q.label}</span>
                <span className="block text-[12px] leading-snug text-muted">{q.hint}</span>
              </span>
              <ChevronRightIcon size={16} className="flex-none text-muted" />
            </>
          );
          return (
            <li key={q.key}>
              {q.href ? (
                <Link href={q.href} data-quick={q.key} className={QUICK_CLS}>
                  {body}
                </Link>
              ) : (
                <button type="button" data-quick={q.key} disabled={!canView} onClick={onView} className={cn(QUICK_CLS, "disabled:opacity-60")}>
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ── the details sheet ──────────────────────────────────────────────────────────────── */

type DetailState = { id: number; result: Fetched<AppDetail> } | null;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] text-ink">{children}</dd>
    </div>
  );
}

function DetailSheet({ orgId, row, state, onClose, onRetry, go, me }: { orgId: number; row: AppRow | null; state: Fetched<AppDetail> | null; onClose: () => void; onRetry: () => void; go: (href: string) => void; me: Viewer }) {
  const d = state?.kind === "OK" ? (state.view ?? null) : null;
  const [now] = useState(() => Date.now());
  const r = d?.row ?? row;
  const st = r ? stageLabel(r.stage, r.closedReason) : null;
  const src = r ? sourceBadge(r.source) : null;
  const nx = r ? nextStep(r) : null;
  return (
    <SideSheet
      id="application-detail-sheet"
      side="right"
      mode="overlay"
      width={480}
      open={row !== null}
      title={row ? `${row.title ?? "Application"}${row.company ? ` at ${row.company}` : ""}` : "Application"}
      description={row?.code || undefined}
      icon={<FileTextIcon size={20} />}
      onClose={onClose}
      footer={
        r ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => go(`${BASE}/marketer`)}>
              Ask my marketer
            </Button>
            {r.stage === "INTERVIEWING" ? (
              <Button size="sm" onClick={() => go(`${BASE}/interview-prep`)}>
                Prepare for interview
              </Button>
            ) : null}
          </div>
        ) : null
      }
    >
      {r && st ? (
        <div data-detail={r.applicationId} className="space-y-5 pt-1">
          {/* the same line the organization's Applications page shows for the same record */}
          {d ? <UpdatedMeta updatedAt={d.updatedAt} updatedBy={d.updatedBy} createdAt={d.createdAt} createdBy={d.createdBy} me={me} now={now} /> : null}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            <Field label="Application ID">{r.code || "-"}</Field>
            <Field label="Current stage">
              <Pill tone={st.tone}>{st.label}</Pill>
            </Field>
            <Field label="Company">{r.company ?? "-"}</Field>
            <Field label="Role">{r.title ?? "-"}</Field>
            <Field label="Applied date">{formatDate(r.appliedOn) || "-"}</Field>
            <Field label="Submission source">{src ? <Pill tone={src.tone}>{src.label}</Pill> : "-"}</Field>
            <Field label="Next step">{nx ? `${nx.action}${nx.due ? ` (${nx.due})` : ""}` : "-"}</Field>
            <Field label="Last stage change">{d ? formatDate(d.stageChangedAt) || "-" : "..."}</Field>
          </dl>
          <section aria-labelledby="app-timeline">
            <h3 id="app-timeline" className="text-[14.5px] font-bold text-ink">
              Stage timeline
            </h3>
            {!state ? (
              <div aria-busy="true" className="mt-3 space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : state.kind !== "OK" || !d ? (
              <div className="py-4 text-[13px] text-muted">
                <p>The timeline didn&apos;t load. Nothing has changed.</p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={onRetry}>
                  Try again
                </Button>
              </div>
            ) : d.timeline.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted">No stage changes have been recorded for this application yet.</p>
            ) : (
              <ol className="mt-3 space-y-3 border-l border-line pl-4" data-timeline>
                {d.timeline.map((e) => {
                  const s = stageLabel(e.toStage, e.toStage === "CLOSED" ? d.row.closedReason : null);
                  return (
                    <li key={e.id} data-step={e.toStage} className="relative text-[13px]">
                      <span aria-hidden className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-accent" />
                      <span className="flex flex-wrap items-center gap-x-2">
                        <span className="font-semibold text-ink">{e.type === "CREATED" ? `Added as ${s.label}` : s.label}</span>
                        <span className="text-[12px] text-muted">{formatDate(e.at)}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-x-1 text-[12px] text-muted" data-actor-line>
                        {e.actor ? actorLine(e.actor, e.actor.kind, null, me) : `By ${ACTOR_LABELS[e.by].toLowerCase()}`}
                        <RelationTag actor={e.actor} me={me} />
                      </span>
                      {e.undoable && e.inboxEventId ? (<InboxUndo endpoints={reviewEndpoints(orgId)} applicationId={r.applicationId} eventId={e.inboxEventId} at={e.at} onUndone={onRetry} />) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
          <p className="text-[11.5px] leading-snug text-muted">You submit applications yourself, on the employer&apos;s site. This page only follows their progress. Your marketer&apos;s internal notes are not shown here.</p>
        </div>
      ) : null}
    </SideSheet>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

export interface ApplicationsPageProps {
  orgId: number;
  firstName: string;
  /** The consultant's own seat: "by you" in the timeline is decided by it. */
  selfMemberId?: number | null;
}

export default function ConsultantApplicationsPage({ orgId, firstName: first, selfMemberId }: ApplicationsPageProps) {
  const router = useRouter();
  const [query, setQuery] = useState<ListQuery>(DEFAULT_QUERY);
  const fetcher = useCallback(() => fetchApplications(orgId, query), [orgId, query]);
  const { view, status, reload } = useWorkspaceData(fetcher);
  const loading = status === "loading";
  const [open, setOpen] = useState<AppRow | null>(null);
  const [state, setState] = useState<DetailState>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    void fetchDetail(orgId, open.applicationId, ctl.signal).then((result) => {
      if (!ctl.signal.aborted) setState({ id: open.applicationId, result });
    });
    return () => ctl.abort();
  }, [orgId, open, attempt]);

  const go = useCallback((href: string) => router.push(href), [router]);
  const actions: RowActions = { open: setOpen, go };

  if (status === "denied") return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  const busy = view !== null && (view.status !== query.status || view.sort !== query.sort || view.paging.page !== query.page);
  const detail = open && state && state.id === open.applicationId ? state.result : null;

  return (
    <div data-consultant-applications data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="My Applications" subtitle="Track your job applications, monitor progress, and stay on top of next steps in your career journey." />
      <ClaimsMascot />
      <ClaimsHelpCard />

      {status === "failed" ? (
        <ErrorState what="your applications" description="Your applications didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.34fr)]">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5">
            <section aria-label="Key numbers" data-applications-tiles className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 2xl:grid-cols-5">
              {TILE_SPECS.map((s, i) => (
                <Tile key={s.key} spec={s} tile={loading || !view ? null : view.tiles[s.key]} index={i} />
              ))}
            </section>
            {view ? (
              <>
                <Applications view={view} query={query} onQuery={setQuery} a={actions} busy={busy} />
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:gap-5 lg:grid-cols-2">
                  <PipelineSummary view={view} />
                  <RecentUpdates view={view} />
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
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)]">
            <BeeCard name={firstName(first)} body="Track your applications, get personalized tips, and prepare for your next interview. I'm here to support you at every step of your journey." />
            <QuickActions canView={!!view && view.rows.length > 0} onView={() => view && view.rows[0] && setOpen(view.rows[0])} />
          </div>
        </div>
      )}

      <DetailSheet orgId={orgId} row={open} state={detail} onClose={() => setOpen(null)} onRetry={() => setAttempt((n) => n + 1)} go={go} me={seatViewer(selfMemberId)} />
    </div>
  );
}

