"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import {
  AlertIcon, BarChartIcon, BriefcaseIcon, Button, CheckCircleIcon, ChevronRightIcon, ClockIcon, DonutChart, DownloadIcon, ErrorState, EyeIcon, FileTextIcon,
  Input, MemberAvatar, Menu, MoreVerticalIcon, PlusIcon, SearchIcon, SendIcon, Select, UserIcon, UsersIcon, ZapIcon, cn, useToast,
} from "@kiwiply/ui";
import type { IconProps, MenuEntry } from "@kiwiply/ui";
import PageHeader, { ClaimsHelpCard, ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { relativeTime } from "@/lib/ent/dashboard";
import {
  ACTION_LABELS, DEFAULT_FILTERS, INTEREST_LABELS, INTERESTS, KPI_KEYS, KPI_TITLES, assignOpportunity, bulkAssign, createOpportunity, exportUrl, fetchOpportunities,
  nextActionText, notifyAwaiting, requestFromConsultant, reviewOpportunity, setNextAction, sharePct,
  type ActionOutcome, type Filters, type KpiKey, type Opportunity, type OpportunitiesView,
} from "@/lib/ent/marketer-ws/opportunities";
import { CARD, CardSkeleton, Empty, HEAD_ROW, Head, HelpBannerCard, KpiTile, TH, TINTS, type MktPageProps, type TintName } from "../parts";
import { INTEREST_TONE, ResumeBadge } from "./bits";
import { AddDialog, BulkDialog, DetailDialog, MatchChip, NotifyDialog } from "./Dialogs";

/**
 * Opportunities (Marketing workspace; design: Opportunities). One call draws the board; every card has its own empty state, never a made-up row.
 * E1: "Assign", "Follow Up" and the quick actions PREPARE or REQUEST (a consultant is asked for their interest and answers on their own
 * workspace); nothing here answers for a consultant, submits for one, or signs in as one.
 */

const KPI_ICONS: Record<KpiKey, { icon: ComponentType<IconProps>; tint: TintName; spark: number }> = {
  open: { icon: BriefcaseIcon, tint: "violet", spark: 3 },
  ready: { icon: UsersIcon, tint: "green", spark: 3 },
  awaiting: { icon: ClockIcon, tint: "violet", spark: 4 },
  stale: { icon: AlertIcon, tint: "pink", spark: 5 },
};

const ACTION_STYLE: Record<Opportunity["action"], string> = {
  REVIEW: "bg-accent text-white hover:brightness-95",
  ASSIGN: "bg-accent text-white hover:brightness-95",
  FOLLOW_UP: "bg-v2-violet-soft text-v2-violet-ink hover:brightness-95",
  COMPARE: "bg-accent-soft text-accent-deep hover:brightness-95",
};

const ACTIVITY_ICON: Record<string, { icon: ComponentType<IconProps>; tint: TintName }> = {
  INTEREST_CHANGED: { icon: CheckCircleIcon, tint: "green" },
  REVIEWED: { icon: EyeIcon, tint: "blue" },
  RESUME_REQUESTED: { icon: FileTextIcon, tint: "amber" },
  RESUME_UPDATED: { icon: FileTextIcon, tint: "violet" },
  ASSIGNED: { icon: DownloadIcon, tint: "violet" },
  INTEREST_REQUESTED: { icon: SendIcon, tint: "amber" },
  CREATED: { icon: PlusIcon, tint: "blue" },
};

const DAY_OPTIONS = [
  { value: "7", label: "Last 7 Days" },
  { value: "30", label: "Last 30 Days" },
  { value: "90", label: "Last 90 Days" },
  { value: "", label: "Any Time" },
];
const SCORE_OPTIONS = [
  { value: "", label: "Match Score" },
  { value: "90", label: "90% and up" },
  { value: "80", label: "80% and up" },
  { value: "70", label: "70% and up" },
];

type Dialog = { kind: "detail"; id: number; mode: "REVIEW" | "COMPARE" } | { kind: "add" } | { kind: "bulk" } | { kind: "notify" } | null;

export default function OpportunitiesPage({ orgId, firstName, hrefs }: MktPageProps) {
  const toast = useToast();
  const [view, setView] = useState<OpportunitiesView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [text, setText] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [working, setWorking] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      void fetchOpportunities(orgId, filters).then((r) => {
        if (!live) return; // a newer request owns the screen
        if (r.kind === "OK") {
          setView(r.view);
          setStatus("ready");
          setNow(Date.now());
        } else setStatus(r.kind === "DENIED" ? "denied" : (s) => (s === "ready" ? s : "failed"));
      });
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [orgId, filters, version]);
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === text ? f : { ...f, q: text, page: 0 })), 300);
    return () => clearTimeout(t);
  }, [text]);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, page: 0, ...patch }));
  const reload = () => setVersion((n) => n + 1);

  /** Run one write, tell the marketer what happened, and redraw. */
  const run = async (id: number | null, call: () => Promise<ActionOutcome>) => {
    if (id !== null) setBusy((b) => new Set(b).add(id));
    else setWorking(true);
    const r = await call();
    toast(r.ok ? { title: r.message, variant: "success" } : { title: r.error, variant: "error" });
    if (id !== null)
      setBusy((b) => {
        const n = new Set(b);
        n.delete(id);
        return n;
      });
    else setWorking(false);
    reload();
    return r;
  };

  const primary = (o: Opportunity) => {
    if (o.action === "ASSIGN") void run(o.id, () => assignOpportunity(orgId, o.id));
    else if (o.action === "FOLLOW_UP") void run(o.id, () => requestFromConsultant(orgId, o.id, o.resumeStatus === "NEEDS_UPDATE" ? "RESUME" : "INTEREST"));
    else setDialog({ kind: "detail", id: o.id, mode: o.action });
  };

  const header = (
    <>
      <PageHeader title="Opportunities" subtitle="Manage shortlisted openings, assign opportunities to consultants, and track consultant interest and readiness." />
      <ClaimsMascot />
      <ClaimsHelpCard />
    </>
  );

  if (status === "denied") return <ErrorState what="Opportunities" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  if (status === "failed")
    return (
      <div data-opportunities data-status="failed">
        {header}
        <ErrorState what="Opportunities" description="Your opportunities didn't load. Nothing has changed." onRetry={reload} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      </div>
    );

  const loading = status === "loading";
  const v = view;
  const awaiting = v?.kpis.find((k) => k.key === "awaiting")?.value ?? 0;
  const filtered = filters.q !== "" || filters.consultantId !== "" || filters.clientId !== "" || filters.interest !== "" || filters.minScore !== "" || filters.stale;
  const sortBy = (key: string) => setFilters((f) => ({ ...f, page: 0, sort: key, dir: f.sort === key && f.dir === "desc" ? "asc" : "desc" }));
  const sortTh = (key: string, label: string) => (
    <th aria-sort={filters.sort === key ? (filters.dir === "asc" ? "ascending" : "descending") : undefined} className={cn(TH, "whitespace-nowrap")}>
      <button type="button" onClick={() => sortBy(key)} className="font-semibold hover:text-ink">{label}</button>
    </th>
  );
  const plainTh = (label: string, cls?: string) => <th className={cn(TH, "whitespace-nowrap", cls)}>{label}</th>;

  const menuFor = (o: Opportunity): MenuEntry[] => {
    const at = (days: number) => {
      const d = new Date(Date.now() + days * 86_400_000);
      d.setHours(9, 0, 0, 0);
      return d.toISOString();
    };
    const items: MenuEntry[] = [{ label: "Open details", onSelect: () => setDialog({ kind: "detail", id: o.id, mode: "REVIEW" }) }];
    if (o.status === "ASSIGNED" && (o.interest === "NO_RESPONSE" || o.interest === "OPEN"))
      items.push({ label: "Request consultant interest", onSelect: () => void run(o.id, () => requestFromConsultant(orgId, o.id, "INTEREST")) });
    items.push({ label: "Request resume update", onSelect: () => void run(o.id, () => requestFromConsultant(orgId, o.id, "RESUME")) });
    items.push({ separator: true });
    items.push({ label: "Next action tomorrow", onSelect: () => void run(o.id, () => setNextAction(orgId, o.id, at(1))) });
    items.push({ label: "Next action in 3 days", onSelect: () => void run(o.id, () => setNextAction(orgId, o.id, at(3))) });
    items.push({ label: "Next action next week", onSelect: () => void run(o.id, () => setNextAction(orgId, o.id, at(7))) });
    return items;
  };

  const quick: { key: string; label: string; icon: ComponentType<IconProps>; tint: TintName; onClick?: () => void; href?: string | null; download?: string }[] = [
    { key: "bulk", label: "Bulk Assign Opportunities", icon: UsersIcon, tint: "blue", onClick: () => setDialog({ kind: "bulk" }) },
    { key: "notify", label: "Send Opportunity Notifications", icon: SendIcon, tint: "coral", onClick: () => setDialog({ kind: "notify" }) },
    { key: "similar", label: "Find Similar Opportunities", icon: SearchIcon, tint: "blue", href: hrefs.matches ?? hrefs.jobs ?? null },
    { key: "export", label: "Export Opportunity List", icon: DownloadIcon, tint: "blue", href: exportUrl(orgId, filters), download: "opportunities.csv" },
    {
      key: "stale", label: "View Stale Opportunities", icon: AlertIcon, tint: "coral",
      onClick: () => {
        set({ stale: true, days: "" });
        document.querySelector('[data-opp-card="table"]')?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      },
    },
  ];
  const quickRow = "flex min-h-9 w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left text-[13.5px] font-semibold text-ink hover:bg-paper-2";

  const total = v?.total ?? 0;
  const from = total === 0 ? 0 : (v?.page ?? 0) * (v?.size ?? 8) + 1;
  const to = Math.min(total, ((v?.page ?? 0) + 1) * (v?.size ?? 8));

  return (
    <div data-opportunities data-status={status} className="flex flex-col gap-4 sm:gap-5">
      {header}

      <section aria-label="Key numbers" data-opp-tiles className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {KPI_KEYS.map((key) => {
          const k = v?.kpis.find((x) => x.key === key);
          const { icon, tint, spark } = KPI_ICONS[key];
          return <KpiTile key={key} id={key} title={KPI_TITLES[key]} icon={icon} tint={tint} value={k ? k.value : null} deltaPct={k?.deltaPct ?? null} sparkline={k?.sparkline} sparkIndex={spark} loading={loading} />;
        })}
      </section>

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.3fr)]">
        <section aria-label="Assigned Opportunities" data-opp-card="table" className={CARD}>
          <Head icon={BriefcaseIcon} title="Assigned Opportunities" tint="blue">
            <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "add" })} className="text-accent-deep">
              <PlusIcon size={15} /> Add Opportunity
            </Button>
          </Head>

          <div data-opp-filters className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 basis-56">
              <SearchIcon size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input type="search" aria-label="Search by consultant or job title" placeholder="Search by consultant or job title..." value={text} onChange={(e) => setText(e.target.value)} className="pl-9" />
            </div>
            <Select variant="pill" aria-label="Consultant" value={filters.consultantId} onChange={(x) => set({ consultantId: x })} options={[{ value: "", label: "All Consultants" }, ...(v?.filters.consultants ?? []).map((c) => ({ value: String(c.id), label: c.name }))]} />
            <Select variant="pill" aria-label="Client" value={filters.clientId} onChange={(x) => set({ clientId: x })} options={[{ value: "", label: "All Clients" }, ...(v?.filters.clients ?? []).map((c) => ({ value: String(c.id), label: c.name }))]} />
            <Select variant="pill" aria-label="Interest status" value={filters.interest} onChange={(x) => set({ interest: x })} options={[{ value: "", label: "Interest Status" }, ...INTERESTS.map((i) => ({ value: i, label: INTEREST_LABELS[i] }))]} />
            <Select variant="pill" aria-label="Match score" value={filters.minScore} onChange={(x) => set({ minScore: x })} options={SCORE_OPTIONS} />
            <Select variant="pill" aria-label="Period" value={filters.days} onChange={(x) => set({ days: x })} options={DAY_OPTIONS} />
            {filters.stale ? (
              <button type="button" onClick={() => set({ stale: false, days: "30" })} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-v2-pink-soft px-3 text-[12.5px] font-semibold text-v2-pink-ink">
                Stale only <span aria-hidden>x</span><span className="sr-only">Show all opportunities</span>
              </button>
            ) : null}
          </div>

          {loading ? (
            <CardSkeleton rows={6} />
          ) : !v || v.items.length === 0 ? (
            <Empty>{filtered ? "No opportunities match these filters." : "Assign the first opportunity."}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-[13px]">
                <thead>
                  <tr className={HEAD_ROW}>
                    {sortTh("consultant", "Consultant")}
                    {plainTh("Opportunity / Job Title")}
                    {sortTh("client", "Client")}
                    {sortTh("score", "Match Score")}
                    {plainTh("Consultant Interest")}
                    {plainTh("Resume Status")}
                    {plainTh("Owner")}
                    {sortTh("next", "Next Action")}
                    {plainTh("Actions", "text-center")}
                  </tr>
                </thead>
                <tbody>
                  {v.items.map((o) => {
                    const days = nextActionText(o.nextActionAt, now);
                    const tone = INTEREST_TONE[o.interest];
                    return (
                      <tr key={o.id} data-opp-row={o.id} data-action={o.action} className="border-b border-line last:border-0">
                        <td className="px-2 py-2"><span className="flex items-center gap-2 whitespace-nowrap font-semibold text-ink"><MemberAvatar name={o.consultant.name} src={o.consultant.avatarUrl} size={34} />{o.consultant.name}</span></td>
                        <td className="px-2"><span className="block font-semibold leading-tight text-ink">{o.jobTitle}</span><span className="block text-[12px] text-muted">{o.location}</span></td>
                        <td className="px-2 text-ink-soft">{o.client}</td>
                        <td className="px-2"><MatchChip pct={o.matchScore} /></td>
                        <td className="px-2"><span data-opp-interest={o.interest} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[12.5px]", tone.pill)}><span aria-hidden className={cn("h-2 w-2 rounded-full", tone.dot)} />{INTEREST_LABELS[o.interest]}</span></td>
                        <td className="px-2"><ResumeBadge state={o.resumeStatus} /></td>
                        <td className="px-2">{o.owner ? <span className="flex items-center gap-2 whitespace-nowrap text-ink-soft"><MemberAvatar name={o.owner.name} src={o.owner.avatarUrl} size={26} />{o.owner.name}</span> : <span className="text-muted">-</span>}</td>
                        <td className={cn("px-2 whitespace-nowrap", days === "Today" || days === "1 day" || days === "Overdue" ? "text-v2-coral-ink" : "text-muted")}>{days}</td>
                        <td className="px-2">
                          <span className="flex items-center justify-center gap-1">
                            <button type="button" disabled={busy.has(o.id)} onClick={() => primary(o)} className={cn("inline-block min-w-[78px] rounded-md px-3 py-1.5 text-[12.5px] font-bold disabled:opacity-60", ACTION_STYLE[o.action])}>
                              {ACTION_LABELS[o.action]}
                            </button>
                            <Menu
                              disabled={busy.has(o.id)}
                              trigger={<button type="button" aria-label={`More for ${o.consultant.name}, ${o.jobTitle}`} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-paper-2"><MoreVerticalIcon size={16} /></button>}
                              items={menuFor(o)}
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

          {v && total > v.size ? (
            <div data-opp-paging className="mt-3 flex items-center justify-between gap-2 text-[12.5px] text-muted">
              <span>Showing {from}-{to} of {total}</span>
              <span className="flex gap-2">
                <Button variant="ghost" size="sm" disabled={v.page <= 0} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>Previous</Button>
                <Button variant="ghost" size="sm" disabled={to >= total} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next</Button>
              </span>
            </div>
          ) : null}
        </section>

        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <HelpBannerCard
            title="Find the right opportunities for your talent faster!"
            body={`I can help you match consultants with the best openings, track their interest, and nudge them on next steps${firstName ? `, ${firstName}` : ""}.`}
          />
          <section aria-label="Quick Actions" data-opp-card="quick" className={CARD}>
            <Head icon={ZapIcon} title="Quick Actions" tint="blue" />
            <ul className="flex flex-col">
              {quick.map((a) => {
                const inner = (
                  <>
                    <span aria-hidden className={cn("grid h-6 w-6 flex-none place-items-center rounded-md", TINTS[a.tint])}><a.icon size={14} /></span>
                    <span className="min-w-0 flex-1 truncate">{a.label}</span>
                    <ChevronRightIcon size={15} aria-hidden className="flex-none text-muted" />
                  </>
                );
                return (
                  <li key={a.key} data-quick={a.key}>
                    {a.href && a.download ? (
                      <a href={a.href} download={a.download} className={quickRow}>{inner}</a>
                    ) : a.href ? (
                      <Link href={a.href} className={quickRow}>{inner}</Link>
                    ) : a.onClick ? (
                      <button type="button" onClick={a.onClick} className={quickRow}>{inner}</button>
                    ) : (
                      <span aria-disabled="true" className={cn(quickRow, "cursor-not-allowed opacity-50 hover:bg-transparent")}>{inner}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.05fr)]">
        <section aria-label="Top Opportunities by Match" data-opp-card="top" className={CARD}>
          <Head icon={BriefcaseIcon} title="Top Opportunities by Match" tint="amber" viewAll={hrefs.matches ?? null} />
          {loading ? (
            <CardSkeleton />
          ) : !v || v.topMatches.length === 0 ? (
            <Empty>No open opportunities to rank yet.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-[13px]">
                <thead>
                  <tr className={HEAD_ROW}>
                    {plainTh("Job Title")}
                    {plainTh("Client")}
                    {plainTh("Location")}
                    {plainTh("Match Score")}
                  </tr>
                </thead>
                <tbody>
                  {v.topMatches.map((t) => (
                    <tr key={t.id} data-top-row={t.id} className="border-b border-line last:border-0">
                      <td className="px-2 py-2 font-semibold text-ink">{t.jobTitle}</td>
                      <td className="px-2 text-ink-soft">{t.client}</td>
                      <td className="px-2 text-ink-soft">{t.location}</td>
                      <td className="px-2"><MatchChip pct={t.matchScore} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-label="Consultant Responses" data-opp-card="responses" className={CARD}>
          <Head icon={BarChartIcon} title="Consultant Responses" tint="blue">
            <Select variant="pill" aria-label="Responses period" value={filters.responseDays} onChange={(x) => setFilters((f) => ({ ...f, responseDays: x }))} options={DAY_OPTIONS} />
          </Head>
          {loading ? (
            <CardSkeleton />
          ) : !v || v.responses.total === 0 ? (
            <Empty>No consultant responses in this period.</Empty>
          ) : (
            <DonutChart
              label="Consultant responses"
              total={v.responses.total}
              totalLabel="Opportunities"
              size={150}
              slices={v.responses.slices.map((s) => ({ key: s.key, label: INTEREST_LABELS[s.key], value: s.count, color: INTEREST_TONE[s.key].chart }))}
            />
          )}
          {v && v.responses.total > 0 ? (
            <p className="sr-only" data-response-pcts>{v.responses.slices.map((s) => `${INTEREST_LABELS[s.key]} ${sharePct(s.count, v.responses.total)}%`).join(", ")}</p>
          ) : null}
        </section>

        <section aria-label="Recent Opportunity Activity" data-opp-card="activity" className={cn(CARD, "lg:col-span-2 xl:col-span-1")}>
          <Head icon={ClockIcon} title="Recent Opportunity Activity" tint="blue" viewAll={hrefs.activity ?? null} />
          {loading ? (
            <CardSkeleton />
          ) : !v || v.activity.length === 0 ? (
            <Empty>Nothing has happened on your opportunities yet.</Empty>
          ) : (
            <ul className="flex flex-col">
              {v.activity.map((a) => {
                const { icon: Icon, tint } = ACTIVITY_ICON[a.kind] ?? { icon: UserIcon, tint: "blue" as TintName };
                return (
                  <li key={a.id} data-activity-row={a.id} className="flex items-start gap-2.5 border-b border-line py-2 last:border-0">
                    <span aria-hidden className={cn("grid h-7 w-7 flex-none place-items-center rounded-full", TINTS[tint])}><Icon size={14} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink"><b>{a.consultant}</b> {a.text}</span>
                      <span className="block truncate text-[12px] text-muted">{a.detail}</span>
                    </span>
                    <span className="flex-none text-[12px] text-muted">{relativeTime(a.at, now)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <DetailDialog
        orgId={orgId}
        id={dialog?.kind === "detail" ? dialog.id : null}
        mode={dialog?.kind === "detail" ? dialog.mode : "REVIEW"}
        busy={working}
        onClose={() => setDialog(null)}
        onReview={(id) => void run(null, () => reviewOpportunity(orgId, id)).then(() => setDialog(null))}
        onChanged={(message) => {
          toast({ title: message, variant: "success" });
          reload();
          setDialog(null);
        }}
      />
      <AddDialog
        orgId={orgId}
        open={dialog?.kind === "add"}
        busy={working}
        onClose={() => setDialog(null)}
        onCreate={(c, j) => void run(null, () => createOpportunity(orgId, c, j)).then((r) => r.ok && setDialog(null))}
      />
      <BulkDialog
        orgId={orgId}
        open={dialog?.kind === "bulk"}
        busy={working}
        onClose={() => setDialog(null)}
        onAssign={(ids) => void run(null, () => bulkAssign(orgId, ids)).then((r) => r.ok && setDialog(null))}
      />
      <NotifyDialog
        open={dialog?.kind === "notify"}
        count={awaiting}
        busy={working}
        onClose={() => setDialog(null)}
        onSend={() => void run(null, () => notifyAwaiting(orgId)).then((r) => r.ok && setDialog(null))}
      />
    </div>
  );
}
