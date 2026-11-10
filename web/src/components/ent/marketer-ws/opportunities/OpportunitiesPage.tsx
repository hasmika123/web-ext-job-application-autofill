"use client";

import { useEffect, useState, type ComponentType } from "react";
import {
  AlertIcon, BriefcaseIcon, Button, ClockIcon, DownloadIcon, ErrorState,
  Input, MemberAvatar, Menu, MoreVerticalIcon, PlusIcon, SearchIcon, Select, SendIcon, UsersIcon, cn, useToast,
} from "@kiwiply/ui";
import type { IconProps, MenuEntry } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import {
  ACTION_LABELS, DEFAULT_FILTERS, DUPLICATE_WARNING, INTEREST_LABELS, INTERESTS, KPI_KEYS, KPI_TITLES, assignOpportunity, bulkAssign, createOpportunity, exportUrl, fetchOpportunities,
  nextActionText, notifyAwaiting, requestFromConsultant, reviewOpportunity, setNextAction, skippedNote,
  type ActionOutcome, type DuplicateFinding, type Filters, type KpiKey, type Opportunity, type OpportunitiesView,
} from "@/lib/ent/marketer-ws/opportunities";
import { CARD, CardSkeleton, Empty, HEAD_ROW, Head, KpiTile, TH, type MktPageProps, type TintName } from "../parts";
import { INTEREST_TONE, ResumeBadge } from "./bits";
import { AddDialog, BulkDialog, DetailDialog, DuplicateDialog, MatchChip, NotifyDialog } from "./Dialogs";

/**
 * Opportunities (Marketing workspace). One call draws the board (two tiles, the interest chip row, the table); every card has its own empty state, never a made-up row.
 * E1: "Assign", "Follow up" and the header actions PREPARE or REQUEST (a consultant is asked for their interest and answers on their own
 * workspace); nothing here answers for a consultant, submits for one, or signs in as one.
 */

const KPI_ICONS: Record<KpiKey, { icon: ComponentType<IconProps>; tint: TintName }> = {
  awaiting: { icon: ClockIcon, tint: "violet" },
  stale: { icon: AlertIcon, tint: "pink" },
};

const ACTION_STYLE: Record<Opportunity["action"], string> = {
  REVIEW: "bg-accent text-white hover:brightness-95",
  ASSIGN: "bg-accent text-white hover:brightness-95",
  FOLLOW_UP: "bg-v2-violet-soft text-v2-violet-ink hover:brightness-95",
  COMPARE: "bg-accent-soft text-accent-deep hover:brightness-95",
};

const DAY_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "", label: "Any time" },
];
const SCORE_OPTIONS = [
  { value: "", label: "Match score" },
  { value: "90", label: "90% and up" },
  { value: "80", label: "80% and up" },
  { value: "70", label: "70% and up" },
];

type Dialog =
  | { kind: "detail"; id: number; mode: "REVIEW" | "COMPARE" }
  | { kind: "add" }
  | { kind: "bulk" }
  | { kind: "notify" }
  | { kind: "duplicate"; opp: Opportunity; message: string; findings: DuplicateFinding[] }
  | null;

export default function OpportunitiesPage({ orgId }: MktPageProps) {
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

  /** Run one write, tell the marketer what happened, and redraw. `quiet` codes are answered by a dialog instead of a toast. */
  const run = async (id: number | null, call: () => Promise<ActionOutcome>, quiet: string[] = []) => {
    if (id !== null) setBusy((b) => new Set(b).add(id));
    else setWorking(true);
    const r = await call();
    if (r.ok) toast({ title: r.message + skippedNote(r.skippedCodes), variant: "success" });
    else if (!(r.code && quiet.includes(r.code))) toast({ title: r.error, variant: "error" });
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

  /** Assign one row. A duplicate warning opens the dialog that asks for a reason; a block or the limit is a plain message (nothing to confirm). */
  const assignOne = async (o: Opportunity, reason?: string) => {
    const r = await run(o.id, () => assignOpportunity(orgId, o.id, reason ? { reason } : undefined), [DUPLICATE_WARNING]);
    if (!r.ok && r.code === DUPLICATE_WARNING) setDialog({ kind: "duplicate", opp: o, message: r.error, findings: r.findings ?? [] });
    else if (r.ok || reason) setDialog(null);
  };

  const primary = (o: Opportunity) => {
    if (o.action === "ASSIGN") void assignOne(o);
    else if (o.action === "FOLLOW_UP") void run(o.id, () => requestFromConsultant(orgId, o.id, o.resumeStatus === "NEEDS_UPDATE" ? "RESUME" : "INTEREST"));
    else setDialog({ kind: "detail", id: o.id, mode: o.action });
  };

  const header = <PageHeader title="Opportunities" subtitle="Openings you've shortlisted for your consultants, and where each stands." />;

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
  const staleCount = v?.kpis.find((k) => k.key === "stale")?.value ?? 0;
  const interestCount = (i: (typeof INTERESTS)[number]) => v?.responses.slices.find((s) => s.key === i)?.count ?? 0;
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

  const total = v?.total ?? 0;
  const from = total === 0 ? 0 : (v?.page ?? 0) * (v?.size ?? 8) + 1;
  const to = Math.min(total, ((v?.page ?? 0) + 1) * (v?.size ?? 8));

  return (
    <div data-opportunities data-status={status} className="flex flex-col gap-4 sm:gap-5">
      {header}

      <section aria-label="Key numbers" data-opp-tiles className="grid grid-cols-2 gap-3 sm:gap-4">
        {KPI_KEYS.map((key) => {
          const k = v?.kpis.find((x) => x.key === key);
          const { icon, tint } = KPI_ICONS[key];
          return <KpiTile key={key} id={key} title={KPI_TITLES[key]} icon={icon} tint={tint} value={k ? k.value : null} loading={loading} />;
        })}
      </section>

      <section aria-label="Opportunities" data-opp-card="table" className={CARD}>
        <Head icon={BriefcaseIcon} title="Opportunities" tint="blue">
          <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "bulk" })} className="text-accent-deep">
            <UsersIcon size={15} /> Bulk assign
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "notify" })} className="text-accent-deep">
            <SendIcon size={15} /> Notify consultants
          </Button>
          <a href={exportUrl(orgId, filters)} download="opportunities.csv" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft">
            <DownloadIcon size={15} aria-hidden /> Export
          </a>
          <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "add" })} className="text-accent-deep">
            <PlusIcon size={15} /> Add opportunity
          </Button>
        </Head>

        <div data-opp-chips role="group" aria-label="Consultant interest" className="mb-3 flex flex-wrap items-center gap-2">
          {INTERESTS.map((i) => {
            const active = filters.interest === i;
            return (
              <button
                key={i}
                type="button"
                aria-pressed={active}
                data-interest-chip={i}
                onClick={() => set({ interest: active ? "" : i })}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-semibold",
                  active ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-paper text-ink-soft hover:border-accent",
                )}
              >
                <span aria-hidden className={cn("h-2 w-2 rounded-full", INTEREST_TONE[i].dot)} />
                {INTEREST_LABELS[i]} ({interestCount(i)})
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={filters.stale}
            data-interest-chip="STALE"
            onClick={() => (filters.stale ? set({ stale: false, days: "30" }) : set({ stale: true, days: "" }))}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-semibold",
              filters.stale ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-paper text-ink-soft hover:border-accent",
            )}
          >
            Stale ({staleCount})
          </button>
        </div>

        <div data-opp-filters className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 basis-56">
            <SearchIcon size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input type="search" aria-label="Search by consultant or job title" placeholder="Search by consultant or job title..." value={text} onChange={(e) => setText(e.target.value)} className="pl-9" />
          </div>
          <Select variant="pill" aria-label="Consultant" value={filters.consultantId} onChange={(x) => set({ consultantId: x })} options={[{ value: "", label: "All consultants" }, ...(v?.filters.consultants ?? []).map((c) => ({ value: String(c.id), label: c.name }))]} />
          <Select variant="pill" aria-label="Client" value={filters.clientId} onChange={(x) => set({ clientId: x })} options={[{ value: "", label: "All clients" }, ...(v?.filters.clients ?? []).map((c) => ({ value: String(c.id), label: c.name }))]} />
          <Select variant="pill" aria-label="Match score" value={filters.minScore} onChange={(x) => set({ minScore: x })} options={SCORE_OPTIONS} />
          <Select variant="pill" aria-label="Period" value={filters.days} onChange={(x) => set({ days: x })} options={DAY_OPTIONS} />
        </div>

        {loading ? (
          <CardSkeleton rows={6} />
        ) : !v || v.items.length === 0 ? (
          <Empty>{filtered ? "No opportunities match these filters." : "Assign the first opportunity."}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[13px]">
              <thead>
                <tr className={HEAD_ROW}>
                  {sortTh("consultant", "Consultant")}
                  {plainTh("Opening")}
                  {sortTh("client", "Client")}
                  {sortTh("score", "Match score")}
                  {plainTh("Consultant interest")}
                  {plainTh("Resume status")}
                  {sortTh("next", "Next action")}
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
      <DuplicateDialog
        open={dialog?.kind === "duplicate"}
        who={dialog?.kind === "duplicate" ? dialog.opp.consultant.name : ""}
        message={dialog?.kind === "duplicate" ? dialog.message : ""}
        findings={dialog?.kind === "duplicate" ? dialog.findings : []}
        busy={dialog?.kind === "duplicate" ? busy.has(dialog.opp.id) : false}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => dialog?.kind === "duplicate" && void assignOne(dialog.opp, reason)}
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
