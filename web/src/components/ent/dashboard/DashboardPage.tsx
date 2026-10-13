"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  AlertIcon,
  BarChartIcon,
  BoardIcon,
  BuildingIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  DollarIcon,
  ErrorState,
  FileTextIcon,
  GearIcon,
  HandshakeIcon,
  InfoIcon,
  BriefcaseIcon,
  MemberAvatar,
  SparklesIcon,
  Tooltip,
  IconButton,
  UserIcon,
  UsersIcon,
  XIcon,
  ZapIcon,
  BarChart,
  DonutChart,
  chartColor,
  useToast,
  cn,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import PageHeader, { ClaimsHelpCard, ClaimsMascot, openHelpPanel } from "@/components/ent/shell/ShellContext";
import { EnterpriseMascot } from "@/lib/ent/mascot";
import { undoToast } from "@/lib/undo-toast";
import {
  TILE_KEYS,
  TILE_TITLES,
  activityHref,
  activityOf,
  activityText,
  alertsOf,
  dismissAlert,
  fetchDashboard,
  invitesOf,
  lastMonths,
  pipelineOf,
  quickActionsOf,
  relativeTime,
  subscriptionOf,
  teamOf,
  widgetOf,
  type AlertItem,
  type DashboardView,
  type DashboardWidget,
  type QuickActionItem,
  type TileKey,
} from "@/lib/ent/dashboard";
import { CARD, CardError, CardHead, CardSkeleton, StatTile, TONES, Unavailable, UpdatedAt, emptyText, type IconTone, type TileSpec } from "./parts";

/**
 * The Organization Dashboard (X2.17; design/enterprise-admin/dashboard.png). One call to `GET /api/orgs/{orgId}/dashboard` (through
 * the BFF) draws the whole page; each widget is shown strictly by its own `state` (see parts.tsx). A widget the API does not send
 * is not drawn. Refreshes when the tab regains focus (at most every 30 s), says when it last did, and never shows a spinner that
 * blocks the page: every card has its own skeleton.
 */

export const REVALIDATE_MS = 30_000;
export const UNDO_MS = 6_000;

const TILES: Record<TileKey, Omit<TileSpec, "key" | "title">> = {
  "consultants.total": { icon: UsersIcon, tone: "violet", spark: "var(--color-v2-violet)" },
  "employees.active": { icon: UserIcon, tone: "green", spark: "var(--color-v2-green)" },
  "applications.active": { icon: FileTextIcon, tone: "accent", spark: "var(--brand-solid, var(--color-accent))" },
  "interviews.upcoming": { icon: CalendarIcon, tone: "amber", spark: "var(--color-v2-amber)" },
  placements: { icon: BriefcaseIcon, tone: "violet", spark: "var(--color-v2-violet)" },
  "finance.summary": { icon: DollarIcon, tone: "pink", spark: "var(--color-v2-coral)" },
};

/** Quick action icon tiles: solid colour, white glyph (the board): brand, green, violet, the brand's second colour. */
const ACTION_ICONS: Record<string, { icon: ComponentType<IconProps>; solid: string }> = {
  "invite-employee": { icon: UserIcon, solid: "bg-[var(--brand-solid,var(--color-accent))]" },
  "assign-marketer": { icon: UsersIcon, solid: "bg-[var(--color-v2-green)]" },
  "configure-licenses": { icon: GearIcon, solid: "bg-[var(--color-v2-violet)]" },
  "review-applications": { icon: FileTextIcon, solid: "bg-[var(--brand-2-solid,var(--color-v2-amber))]" },
  "view-pipeline": { icon: BoardIcon, solid: "bg-[var(--color-v2-teal)]" },
  "configure-organization": { icon: BuildingIcon, solid: "bg-[var(--color-v2-coral)]" },
};

/* ── data hook ─────────────────────────────────────────────────────────────────────── */

type Status = "loading" | "ready" | "failed" | "denied";

function useDashboard(orgId: number) {
  const [view, setView] = useState<DashboardView | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const last = useRef(0);
  const inflight = useRef(false);

  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setRefreshing(true);
    const r = await fetchDashboard(orgId);
    inflight.current = false;
    setRefreshing(false);
    last.current = Date.now();
    if (r.kind === "OK" && r.view) {
      setView(r.view);
      setStatus("ready");
      setUpdatedAt(Date.now());
    } else if (r.kind === "DENIED") setStatus("denied");
    else setStatus((s) => (s === "ready" ? s : "failed")); // a failed refresh keeps what is on screen
  }, [orgId]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0); // the first load runs after mount, outside the effect body
    return () => clearTimeout(t);
  }, [load]);

  // Revalidate when the person comes back (tab focus / visibility), at most every REVALIDATE_MS.
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current > REVALIDATE_MS) void load();
    };
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [load]);

  return { view, status, updatedAt, refreshing, reload: load };
}

function useNow(ms = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/* ── the cards ─────────────────────────────────────────────────────────────────────── */

type CardBody = { loading: boolean; widget: DashboardWidget | null; onRetry: () => void };

/** The states every card shares; returns the card's body when it is not `ok`, or null when the card should draw its data. */
function stateBody({ loading, widget, onRetry }: CardBody, what: string, empty?: string): React.ReactNode | null {
  if (loading) return <CardSkeleton />;
  if (!widget) return null;
  if (widget.state === "unavailable") return <Unavailable module={widget.module} />;
  if (widget.state === "error") return <CardError what={what} onRetry={onRetry} />;
  if (widget.state === "empty") return <p className="py-6 text-center text-[13.5px] text-muted">{empty ?? emptyText(widget.reason)}</p>;
  return null;
}

/** Series colours by key: brand primary, status green, the brand's second colour. Distinct from each other whatever the tenant's colours are. */
const TEAM_COLORS: Record<string, string> = { applications: chartColor(0), interviews: "var(--color-v2-green)", placements: chartColor(1) };
/** Pipeline stages, left to right through the funnel: brand, blue, brand second colour, green, violet. */
const STAGE_COLORS: Record<string, string> = { new: chartColor(0), in_review: "var(--color-v2-teal)", interviewing: chartColor(1), offered: "var(--color-v2-green)", hired: "var(--color-v2-violet)" };

const RANGES = [
  { months: 3, label: "Last 3 Months" },
  { months: 6, label: "Last 6 Months" },
] as const;

function TeamPerformanceCard({ body }: { body: CardBody }) {
  const [range, setRange] = useState<number>(6);
  const { widget } = body;
  if (!body.loading && !widget) return null;
  const shared = stateBody(body, "team performance");
  const full = !body.loading ? teamOf(widget) : null;
  const team = full ? lastMonths(full, range) : null;
  return (
    <section aria-labelledby="dash-team" data-dash-card="team.performance" data-state={body.loading ? "loading" : widget?.state} className={cn(CARD, "flex min-w-0 flex-col p-4 sm:p-5 lg:col-span-2 xl:col-span-1")}>
      <CardHead id="dash-team" icon={BarChartIcon} title="Team Performance">
        {team ? (
          <select
            aria-label="Range"
            data-team-range
            value={range}
            onChange={(e) => setRange(Number(e.target.value))}
            className="min-h-9 flex-none rounded-lg border border-line bg-paper px-2.5 text-[13px] font-medium text-ink-soft hover:bg-paper-2"
          >
            {RANGES.filter((r) => r.months <= (full?.months.length ?? 0)).map((r) => (
              <option key={r.months} value={r.months}>
                {r.label}
              </option>
            ))}
          </select>
        ) : null}
      </CardHead>
      <div className="mt-3 flex flex-1 flex-col">
        {shared ?? (team ? <BarChart label="Team performance by month" categories={team.months} series={team.series.map((x) => ({ ...x, color: TEAM_COLORS[x.key] }))} height={230} /> : <p className="py-6 text-center text-[13.5px] text-muted">{emptyText(null)}</p>)}
      </div>
    </section>
  );
}

function PipelineCard({ body }: { body: CardBody }) {
  const { widget } = body;
  if (!body.loading && !widget) return null;
  const shared = stateBody(body, "the pipeline");
  const pipe = !body.loading ? pipelineOf(widget) : null;
  return (
    <section aria-labelledby="dash-pipeline" data-dash-card="pipeline.overview" data-state={body.loading ? "loading" : widget?.state} className={cn(CARD, "flex min-w-0 flex-col p-4 sm:p-5")}>
      <CardHead id="dash-pipeline" icon={HandshakeIcon} title="Pipeline Overview" tone="teal" />
      <div className="mt-3 flex flex-1 flex-col">
        {shared ??
          (pipe ? (
            <DonutChart size={150} label="Applications by stage" total={pipe.total} totalLabel="Total Applications" slices={pipe.slices.map((x) => ({ ...x, color: STAGE_COLORS[x.key] }))} />
          ) : (
            <p className="py-6 text-center text-[13.5px] text-muted">{emptyText(null)}</p>
          ))}
      </div>
    </section>
  );
}

const ACTIVITY_SHOWN = 6; // the board shows five or six; "View all" has the rest
const QUICK_SHOWN = 4; // the board shows four; the rest the API sends are reachable from the menu

function QuickActionsCard({ body }: { body: CardBody }) {
  const { widget } = body;
  if (!body.loading && !widget) return null;
  const shared = stateBody(body, "your shortcuts");
  const every = widget && !body.loading ? quickActionsOf(widget) : [];
  const items = every.slice(0, QUICK_SHOWN);
  return (
    <section aria-labelledby="dash-quick" data-dash-card="quick.actions" className={cn(CARD, "flex min-w-0 flex-col p-4 sm:p-5")}>
      <CardHead id="dash-quick" icon={ZapIcon} title="Quick Actions" />
      <div className="mt-3 flex-1">
        {shared ?? (
          <ul className="flex flex-col gap-2">
            {items.map((a) => (
              <li key={a.key}>
                <ActionRow a={a} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ActionRow({ a }: { a: QuickActionItem }) {
  const meta = ACTION_ICONS[a.key] ?? { icon: SparklesIcon, solid: "bg-[var(--brand-solid,var(--color-accent))]" };
  const Icon = meta.icon;
  const inner = (
    <>
      <span aria-hidden className={cn("grid h-11 w-11 flex-none place-items-center rounded-xl text-white", meta.solid)}>
        <Icon size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] font-semibold leading-tight text-ink">{a.label}</span>
        <span className="line-clamp-2 text-[13px] leading-snug text-muted">{a.description}</span>
      </span>
    </>
  );
  const row = "flex min-h-[60px] items-center gap-3.5 rounded-xl border border-line bg-paper px-3 py-2";
  if (!a.available)
    return (
      <div data-quick-action={a.key} data-available="false" aria-disabled="true" className={cn(row, "bg-paper-2/50")}>
        {inner}
        <Tooltip content={a.soonModule ? `Arrives with ${a.soonModule}` : "Coming soon"} side="left">
          <span tabIndex={0} data-soon-chip className="flex-none rounded-full bg-paper-2 px-2 py-0.5 text-[11.5px] font-bold text-ink-soft ring-1 ring-line">
            Soon
          </span>
        </Tooltip>
      </div>
    );
  return (
    <Link href={a.href} data-quick-action={a.key} data-available="true" className={cn(row, "group transition-colors hover:bg-paper-2")}>
      {inner}
      <ChevronRightIcon aria-hidden size={16} className="flex-none text-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  );
}

const SEVERITY: Record<AlertItem["severity"], { icon: ComponentType<IconProps>; tone: IconTone; word: string }> = {
  danger: { icon: AlertIcon, tone: "coral", word: "Urgent" },
  warn: { icon: AlertIcon, tone: "amber", word: "Warning" },
  info: { icon: InfoIcon, tone: "accent", word: "Info" },
};

const ALERTS_SHOWN = 4; // the board shows four; "View all" opens the rest

function AlertsCard({ body, hidden, onDismiss, now }: { body: CardBody; hidden: Set<string>; onDismiss: (a: AlertItem) => void; now: number }) {
  const [all, setAll] = useState(false);
  const { widget } = body;
  if (!body.loading && !widget) return null;
  const every = widget && !body.loading ? alertsOf(widget).filter((a) => !hidden.has(a.key)) : [];
  const items = all ? every : every.slice(0, ALERTS_SHOWN);
  const shared = stateBody(body, "your alerts");
  const allClear = !shared && items.length === 0;
  return (
    <section aria-labelledby="dash-alerts" data-dash-card="alerts" className={cn(CARD, "flex min-w-0 flex-col p-4 sm:p-5")}>
      <CardHead id="dash-alerts" icon={AlertIcon} title="Activity & Alerts" tone="coral">
        {every.length > ALERTS_SHOWN ? (
          <button
            type="button"
            data-alerts-view-all
            aria-expanded={all}
            onClick={() => setAll((v) => !v)}
            className="flex-none rounded-lg border border-[var(--brand-border,var(--color-line))] bg-accent-soft px-3 py-1.5 text-[12.5px] font-semibold text-accent-deep hover:bg-accent-soft/70"
          >
            {all ? "Show fewer" : "View all"}
          </button>
        ) : null}
      </CardHead>
      <div className="mt-3 flex-1">
        {shared ??
          (allClear ? (
            <p data-alerts-clear className="flex items-center justify-center gap-2 py-6 text-center text-[13.5px] text-muted">
              <CheckCircleIcon size={18} className="text-v2-green-ink" /> All clear. Nothing needs your attention.
            </p>
          ) : (
            <ul className="divide-y divide-line/70" aria-live="polite">
              {items.map((a) => {
                const s = SEVERITY[a.severity];
                const Icon = s.icon;
                const title = (
                  <>
                    <span className="sr-only">{s.word}: </span>
                    {a.title}
                  </>
                );
                return (
                  <li key={a.key} data-alert={a.key} data-severity={a.severity} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span aria-hidden className={cn("mt-0.5 grid h-10 w-10 flex-none place-items-center rounded-full", TONES[s.tone])}>
                      <Icon size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold leading-snug text-ink">
                        {a.href ? (
                          <Link href={a.href} className="underline-offset-2 hover:underline">
                            {title}
                          </Link>
                        ) : (
                          title
                        )}
                      </p>
                      {a.message ? <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{a.message}</p> : null}
                    </div>
                    {a.at ? (
                      <time dateTime={a.at} title={new Date(a.at).toLocaleString()} className="mt-1 flex-none whitespace-nowrap text-[12px] text-muted">
                        {relativeTime(a.at, now)}
                      </time>
                    ) : null}
                    <Tooltip content="Dismiss for 7 days" side="left">
                      <IconButton aria-label={`Dismiss for 7 days: ${a.title}`} onClick={() => onDismiss(a)} className="h-9 w-9 flex-none">
                        <XIcon size={15} />
                      </IconButton>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          ))}
      </div>
    </section>
  );
}

function RecentActivityCard({ body, now, viewAll }: { body: CardBody; now: number; viewAll: string | null }) {
  const { widget } = body;
  if (!body.loading && !widget) return null;
  const shared = stateBody(body, "recent activity");
  const items = widget && !body.loading ? activityOf(widget).slice(0, ACTIVITY_SHOWN) : [];
  return (
    <section aria-labelledby="dash-activity" data-dash-card="activity.recent" data-state={body.loading ? "loading" : widget?.state} className={cn(CARD, "flex min-w-0 flex-col p-4 sm:p-5")}>
      <CardHead id="dash-activity" icon={ClockIcon} title="Recent Activity" tone="accent">
        {viewAll ? (
          <Link href={viewAll} className="flex-none rounded-lg border border-[var(--brand-border,var(--color-line))] bg-accent-soft px-3 py-1.5 text-[12.5px] font-semibold text-accent-deep hover:bg-accent-soft/70">
            View all
          </Link>
        ) : null}
      </CardHead>
      <div className="mt-3 flex-1">
        {shared ?? (
          <ul className="divide-y divide-line/70">
            {items.map((a) => {
              const t = activityText(a);
              const href = activityHref(a);
              const row = (
                <>
                  <MemberAvatar name={t.who} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] leading-snug text-ink">
                      <span className="font-semibold">{t.who}</span> {t.what}
                    </p>
                    {t.target ? <p className="truncate text-[12.5px] text-muted">{t.target}</p> : null}
                  </div>
                  <time dateTime={a.at} title={new Date(a.at).toLocaleString()} className="flex-none whitespace-nowrap text-[12px] text-muted">
                    {relativeTime(a.at, now)}
                  </time>
                </>
              );
              return (
                <li key={`${a.source}-${a.id}`} data-activity={`${a.source}-${a.id}`}>
                  {href ? (
                    <Link href={href} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-paper-2/60">
                      {row}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 py-2.5">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/** The help card's "dismissed" memory: per organization, in this browser only (a convenience, never state that matters). */
const helpKey = (orgId: number) => `kiwiply.dashboard.help.dismissed.${orgId}`;

function useHelpDismissed(orgId: number): { dismissed: boolean | null; dismiss: () => void } {
  const [dismissed, setDismissed] = useState<boolean | null>(null); // null until the browser has been asked
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setDismissed(window.localStorage.getItem(helpKey(orgId)) === "1");
      } catch {
        setDismissed(false);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [orgId]);
  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(helpKey(orgId), "1");
    } catch {
      /* private window or blocked storage: it simply comes back next time */
    }
  }, [orgId]);
  return { dismissed, dismiss };
}

function BeeHelpCard({ firstName, orgName, onDismiss }: { firstName: string; orgName: string; onDismiss: () => void }) {
  return (
    <section aria-label="Help" data-dash-card="help" className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line/70 bg-paper shadow-[0_1px_3px_rgb(16_24_40/0.06)] md:col-span-2 xl:col-span-1">
      <ClaimsMascot />
      <ClaimsHelpCard />
      <IconButton aria-label="Dismiss the help card" data-help-dismiss onClick={onDismiss} className="absolute right-2 top-2 z-10 h-8 w-8 bg-paper/80">
        <XIcon size={15} />
      </IconButton>
      <div className="flex justify-center bg-accent-soft pt-3">
        <EnterpriseMascot pose="greet" size="lg" />
      </div>
      <div className="p-4 sm:p-5">
        <h2 className="text-[19px] font-extrabold leading-tight text-ink">Need help, {firstName}?</h2>
        <p className="mt-1.5 text-[13.5px] leading-snug text-muted">I can help you find reports, manage users, or answer questions about {orgName}.</p>
        <button
          type="button"
          onClick={openHelpPanel}
          className="mt-4 flex min-h-11 w-full items-center gap-2 rounded-xl border border-[var(--brand-border,var(--color-line))] bg-accent-soft px-3 text-left text-[14px] font-semibold text-accent-deep hover:bg-accent-soft/70"
        >
          <SparklesIcon size={17} className="flex-none" />
          <span className="min-w-0 flex-1 truncate">Ask a question...</span>
          <ChevronRightIcon size={16} className="flex-none" />
        </button>
      </div>
    </section>
  );
}

/* ── the page ──────────────────────────────────────────────────────────────────────── */

export interface DashboardPageProps {
  orgId: number;
  orgName: string;
  firstName: string;
  /** The audit log page for "View all" on Recent Activity, when this member's menu has one. */
  auditHref?: string | null;
  /** The applications page, where "View all" goes when there is no audit page. */
  applicationsHref?: string | null;
  /** The sidebar page that lists the employees / invitations, for the slim status chips. */
  employeesHref?: string | null;
  invitationsHref?: string | null;
}

export default function DashboardPage({ orgId, orgName, firstName, auditHref = null, applicationsHref = null, employeesHref = null, invitationsHref = null }: DashboardPageProps) {
  const { view, status, updatedAt, refreshing, reload } = useDashboard(orgId);
  const toast = useToast();
  const help = useHelpDismissed(orgId);
  const now = useNow();
  const loading = status === "loading";
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const unhide = useCallback((key: string) => setHidden((h) => (h.has(key) ? new Set([...h].filter((k) => k !== key)) : h)), []);

  const commit = useCallback(
    async (key: string) => {
      pending.current.delete(key);
      const ok = await dismissAlert(orgId, key);
      if (!ok) {
        unhide(key);
        toast({ title: "Couldn't dismiss that alert", description: "It is back in the list. Try again in a moment.", variant: "error" });
      }
    },
    [orgId, toast, unhide],
  );

  const dismiss = useCallback(
    (a: AlertItem) => {
      setHidden((h) => new Set(h).add(a.key));
      pending.current.set(a.key, setTimeout(() => void commit(a.key), UNDO_MS));
      undoToast(toast, {
        title: "Alert dismissed for 7 days",
        description: a.title,
        ms: UNDO_MS,
        onUndo: () => {
          const t = pending.current.get(a.key);
          if (t) clearTimeout(t);
          pending.current.delete(a.key);
          unhide(a.key);
        },
      });
    },
    [commit, toast, unhide],
  );

  // Leaving the page (or closing the tab) inside the undo window still saves the dismissal.
  useEffect(() => {
    const map = pending.current;
    const flush = () => {
      for (const [key, t] of map) {
        clearTimeout(t);
        void dismissAlert(orgId, key, true);
      }
      map.clear();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [orgId]);

  const w = useCallback((key: string): DashboardWidget | null => widgetOf(view, key), [view]);
  const body = useCallback((key: string): CardBody => ({ loading, widget: w(key), onRetry: () => void reload() }), [loading, w, reload]);

  const invites = invitesOf(w("invites.pending"));
  const sub = subscriptionOf(w("subscription.summary"));
  const chips = useMemo(() => {
    const out: { key: string; text: string; href: string | null; tone: "info" | "warn" }[] = [];
    if (invites && invites.invited > 0)
      out.push({
        key: "invited",
        text: `${invites.invited} invitation${invites.invited === 1 ? "" : "s"} waiting${invites.expiringSoon > 0 ? ` (${invites.expiringSoon} expiring soon)` : ""}`,
        href: invitationsHref,
        tone: invites.expiringSoon > 0 ? "warn" : "info",
      });
    if (invites && invites.suspended > 0) out.push({ key: "suspended", text: `${invites.suspended} suspended`, href: employeesHref, tone: "info" });
    if (sub && sub.orgStatus.toUpperCase() !== "ACTIVE") out.push({ key: "subscription", text: `Subscription ${sub.orgStatus.toLowerCase().replace(/_/g, " ")}`, href: null, tone: "warn" });
    return out;
  }, [invites, sub, invitationsHref, employeesHref]);

  const updatedText = updatedAt ? `Updated ${relativeTime(new Date(updatedAt).toISOString(), now)}` : "";

  if (status === "denied") return <ErrorState what="the dashboard" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  return (
    <div data-dashboard data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="Organization Dashboard" subtitle={`Welcome back! Here's what's happening at ${orgName} today.`} />

      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <ul aria-label="Needs a look" className="flex min-w-0 flex-wrap gap-2">
          {chips.map((c) => {
            const cls = cn("inline-flex min-h-8 items-center rounded-full px-3 text-[12.5px] font-semibold", c.tone === "warn" ? "bg-v2-amber-soft text-v2-amber-ink" : "bg-accent-soft text-accent-deep");
            return (
              <li key={c.key} data-dash-chip={c.key}>
                {c.href ? (
                  <Link href={c.href} className={cn(cls, "hover:underline")}>
                    {c.text}
                  </Link>
                ) : (
                  <span className={cls}>{c.text}</span>
                )}
              </li>
            );
          })}
        </ul>
        {status === "ready" ? <UpdatedAt text={updatedText} refreshing={refreshing} onRefresh={() => void reload()} /> : <span className="sr-only" role="status" aria-live="polite">{loading ? "Loading the dashboard" : ""}</span>}
      </div>

      {status === "failed" ? (
        <ErrorState what="the dashboard" description="Your organization's numbers didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <>
          <section aria-label="Key numbers" data-dash-tiles className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
            {TILE_KEYS.map((key, i) => (
              <StatTile key={key} index={i} loading={loading} widget={w(key)} spec={{ key, title: TILE_TITLES[key], ...TILES[key] }} onRetry={() => void reload()} />
            ))}
          </section>

          <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.77fr)_minmax(0,1.16fr)_minmax(0,1fr)]">
            <TeamPerformanceCard body={body("team.performance")} />
            <PipelineCard body={body("pipeline.overview")} />
            <QuickActionsCard body={body("quick.actions")} />
          </div>

          <div className={cn("grid gap-4 sm:gap-5 lg:grid-cols-2", help.dismissed === false ? "xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_minmax(0,1fr)]" : "xl:grid-cols-2")}>
            <AlertsCard body={body("alerts")} hidden={hidden} onDismiss={dismiss} now={now} />
            <RecentActivityCard body={body("activity.recent")} now={now} viewAll={auditHref ?? applicationsHref} />
            {help.dismissed === false ? <BeeHelpCard firstName={firstName} orgName={orgName} onDismiss={help.dismiss} /> : null}
          </div>
        </>
      )}
    </div>
  );
}
