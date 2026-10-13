"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import ConsultantsPanel, { type ConsultantsState } from "./ConsultantsPanel";
import { AddMarketerDialog, AssignDialog, CapacityDialog, MarketerPickerDialog, WorkloadDialog, type SubmitOutcome } from "./dialogs";
import KpiRow from "./KpiRow";
import MarketersPanel, { type MarketersState } from "./MarketersPanel";
import {
  bulkSummary,
  consultantParams,
  DEFAULT_QUERY,
  errorSentence,
  marketingApi,
  overCapacityOf,
  parseQuery,
  toSearch,
  undoRows,
  type ApiResult,
  type BoardQuery,
  type BulkResult,
  type Filters,
  type Kpis,
  type Marketer,
  type Row,
  type UpdateBody,
  type UpdateField,
} from "@/lib/ent/marketing-assignments";

const UNDO_MS = 9000; // config-literal-ok: how long an Undo stays offered (UI timing)

/** A call that may be refused for capacity: the dialogs show the over-capacity notice, other refusals become a sentence. */
function outcomeOf(r: ApiResult<BulkResult>): SubmitOutcome | null {
  if (r.ok) return null;
  const over = overCapacityOf(r);
  return over ? { ok: false, error: errorSentence(r), over } : { ok: false, error: errorSentence(r) };
}

export interface MarketingAssignmentsPageProps {
  orgId: number;
  orgName: string;
  /** The workspace slug (`admin`): Add Marketer points to `/w/{workspace}/invitations` for someone new. */
  workspace: string;
  /** `me.permissions` of the tenant session: decides which buttons are drawn (the API is the gate). */
  permissions: Record<string, string>;
  /** The URL's search string on first render, so a shared link opens on the same marketer, filters and page. */
  initialSearch?: Record<string, string | string[] | undefined>;
}

type Dialogs =
  | { kind: "none" }
  | { kind: "assign" }
  | { kind: "add" }
  | { kind: "report" }
  | { kind: "capacity"; marketer: Marketer }
  | { kind: "reassign"; ids: number[]; fromIds: number[] }
  | { kind: "backup"; ids: number[]; marketerId: number | null };

/**
 * The Marketing Assignments board (design/enterprise-talent/marketing-assignments.png): four KPI tiles, the marketers with their
 * workload, and the selected marketer's consultants. Every change shows an Undo toast that sends the reverse call; there are no Save
 * buttons. The URL carries the selected marketer, filters, sort and page. A marketer prepares, requests and records: nothing here
 * submits an application or acts as a consultant.
 */
export default function MarketingAssignmentsPage({ orgId, orgName, workspace, permissions, initialSearch }: MarketingAssignmentsPageProps) {
  const toast = useToast();
  const can = useCallback((k: string) => Object.prototype.hasOwnProperty.call(permissions, k), [permissions]);
  const mayManage = can("assignments.manage");

  const [query, setQuery] = useState<BoardQuery>(() => (initialSearch ? parseQuery(initialSearch) : DEFAULT_QUERY));
  const [marketers, setMarketers] = useState<MarketersState>({ status: "loading" });
  const [kpis, setKpis] = useState<{ status: "loading" | "ok" | "error"; data: Kpis | null }>({ status: "loading", data: null });
  const [filters, setFilters] = useState<Filters | null>(null);
  const [list, setList] = useState<ConsultantsState>({ status: "idle" });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<Dialogs>({ kind: "none" });
  const [moreOpen, setMoreOpen] = useState(() => !!(query.availability || query.noBackup));
  const rootSeq = useRef(0);
  const listSeq = useRef(0);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  });

  /* ── data ─────────────────────────────────────────────────────────────────────── */

  const loadMarketers = useCallback(
    async (quiet: boolean) => {
      const mine = ++rootSeq.current;
      if (!quiet) setMarketers({ status: "loading" });
      const q = queryRef.current;
      const r = await marketingApi.marketers(orgId, { q: q.mq, status: q.mstatus });
      if (mine !== rootSeq.current) return;
      setMarketers(r.ok ? { status: "ok", data: r.data } : { status: "error", message: errorSentence(r) });
    },
    [orgId],
  );

  const loadKpis = useCallback(async () => {
    const r = await marketingApi.kpis(orgId);
    setKpis(r.ok ? { status: "ok", data: r.data } : (k) => ({ status: "error", data: k.data }));
  }, [orgId]);

  useEffect(() => {
    void loadMarketers(false);
  }, [query.mq, query.mstatus, loadMarketers]);

  useEffect(() => {
    void loadKpis();
    void marketingApi.filters(orgId).then((r) => setFilters(r.ok ? r.data : null));
  }, [orgId, loadKpis]);

  /** The selected marketer: the URL's when it is in the list, otherwise the first (the most loaded). */
  const items = useMemo(() => (marketers.status === "ok" ? marketers.data.items : []), [marketers]);
  const marketer = useMemo(() => items.find((m) => m.memberId === query.marketerId) ?? null, [items, query.marketerId]);
  useEffect(() => {
    if (marketers.status !== "ok") return;
    if (items.length > 0 && !items.some((m) => m.memberId === queryRef.current.marketerId)) setQuery((q) => ({ ...q, marketerId: items[0].memberId, page: 0 }));
  }, [marketers, items]);

  const loadList = useCallback(
    async (q: BoardQuery, quiet: boolean) => {
      const mine = ++listSeq.current;
      if (!quiet) setList({ status: "loading" });
      const r = await marketingApi.consultants(orgId, consultantParams(q, q.marketerId));
      if (mine !== listSeq.current) return;
      setList(r.ok ? { status: "ok", items: r.data.items, total: r.data.total } : { status: "error", message: errorSentence(r) });
    },
    [orgId],
  );

  const filterKey = [query.marketerId, query.q, query.status, query.priority, query.clientId, query.availability, query.noBackup, query.sort.key, query.sort.dir, query.page, query.size].join("|");
  useEffect(() => {
    if (marketers.status === "ok" && items.length === 0) {
      setList({ status: "ok", items: [], total: 0 });
      return;
    }
    if (marketer) void loadList(queryRef.current, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, marketer?.memberId, marketers.status, loadList]);

  const refresh = useCallback(() => {
    void loadMarketers(true);
    void loadKpis();
    if (queryRef.current.marketerId != null) void loadList(queryRef.current, true);
  }, [loadMarketers, loadKpis, loadList]);

  /* ── the URL carries the view ─────────────────────────────────────────────────── */

  useEffect(() => {
    const s = toSearch(query).toString();
    const next = `${window.location.pathname}${s ? `?${s}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", next);
  }, [query]);

  const change = useCallback((c: Partial<BoardQuery>) => setQuery((q) => ({ ...q, ...c, page: c.page ?? 0 })), []);
  const pickMarketer = useCallback((id: number) => {
    setSelected(new Set());
    setQuery((q) => ({ ...q, marketerId: id, page: 0 }));
    document.querySelector("[data-consultants-panel]")?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, []);

  /* ── selection ────────────────────────────────────────────────────────────────── */

  const rows = list.status === "ok" ? list.items : [];
  useEffect(() => {
    setSelected(new Set());
  }, [filterKey]);
  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const togglePage = (on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      for (const r of rows) {
        if (on) n.add(r.consultantId);
        else n.delete(r.consultantId);
      }
      return n;
    });

  /* ── changes with Undo ────────────────────────────────────────────────────────── */

  const undo = useCallback(
    async (res: BulkResult) => {
      const back = undoRows(res.results);
      if (back.length === 0) return;
      const r = await marketingApi.restore(orgId, back);
      toast(r.ok && r.data.skipped.length === 0 ? { title: "Undone", variant: "success" } : { title: "Couldn't undo everything", description: r.ok ? "Some consultants are no longer in your view." : errorSentence(r), variant: "error" });
      refresh();
    },
    [orgId, toast, refresh],
  );

  /** The outcome of a change as one toast with an Undo that sends the reverse from `previous`. */
  const announce = useCallback(
    (res: BulkResult, verb: string, extra?: string) => {
      const sum = bulkSummary(res, verb, extra);
      const canUndo = undoRows(res.results).length > 0;
      toast({ ...sum, duration: UNDO_MS, action: canUndo ? { label: "Undo", onClick: () => void undo(res) } : undefined });
      setSelected(new Set());
      refresh();
    },
    [toast, undo, refresh],
  );

  const assignTo = useCallback(
    async (ids: number[], marketerId: number, allowOver: boolean, extra?: { backup?: number | null }): Promise<SubmitOutcome> => {
      const r = await marketingApi.assign(orgId, { consultantIds: ids, marketerMemberId: marketerId, ...(allowOver ? { allowOverCapacity: true } : {}), ...(extra?.backup ? { backupMemberId: extra.backup } : {}) });
      const bad = outcomeOf(r);
      if (bad) return bad;
      if (r.ok) announce(r.data, "assigned", allowOver ? "Over capacity, recorded in the audit log" : undefined);
      return { ok: true };
    },
    [orgId, announce],
  );

  const patch = useCallback(
    async (ids: number[], body: UpdateField, verb: string): Promise<SubmitOutcome> => {
      const r = await marketingApi.update(orgId, { consultantIds: ids, ...body } as UpdateBody);
      const bad = outcomeOf(r);
      if (bad) {
        toast({ title: "Couldn't update", description: bad.ok ? undefined : bad.error, variant: "error" });
        return bad;
      }
      if (r.ok) announce(r.data, verb);
      return { ok: true };
    },
    [orgId, announce, toast],
  );

  const unassign = useCallback(
    async (ids: number[]) => {
      const r = await marketingApi.unassign(orgId, ids);
      if (!r.ok) {
        toast({ title: "Couldn't unassign", description: errorSentence(r), variant: "error" });
        return;
      }
      announce(r.data, "unassigned");
    },
    [orgId, announce, toast],
  );

  const setCapacity = useCallback(
    async (m: Marketer, capacity: number): Promise<SubmitOutcome> => {
      const r = await marketingApi.updateMarketer(orgId, m.memberId, { capacity });
      if (!r.ok) return { ok: false, error: errorSentence(r) };
      toast({
        title: `${m.name}'s capacity is ${capacity}`,
        variant: "success",
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () =>
            void marketingApi.updateMarketer(orgId, m.memberId, { capacity: m.capacity }).then((u) => {
              toast(u.ok ? { title: "Undone", variant: "success" } : { title: "Couldn't undo", description: errorSentence(u), variant: "error" });
              refresh();
            }),
        },
      });
      refresh();
      return { ok: true };
    },
    [orgId, toast, refresh],
  );

  const togglePause = useCallback(
    async (m: Marketer) => {
      const to = m.status === "PAUSED" ? "ACTIVE" : "PAUSED";
      const r = await marketingApi.updateMarketer(orgId, m.memberId, { status: to });
      if (!r.ok) {
        toast({ title: `Couldn't ${to === "PAUSED" ? "pause" : "resume"} ${m.name}`, description: errorSentence(r), variant: "error" });
        return;
      }
      toast({
        title: to === "PAUSED" ? `${m.name} is paused` : `${m.name} is active again`,
        description: to === "PAUSED" ? "They keep their consultants but take no new ones." : undefined,
        variant: "success",
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () =>
            void marketingApi.updateMarketer(orgId, m.memberId, { status: m.status }).then((u) => {
              toast(u.ok ? { title: "Undone", variant: "success" } : { title: "Couldn't undo", description: errorSentence(u), variant: "error" });
              refresh();
            }),
        },
      });
      refresh();
    },
    [orgId, toast, refresh],
  );

  /* ── menus ────────────────────────────────────────────────────────────────────── */

  const actionsFor = (ids: number[], from: Row[]): MenuEntry[] => {
    const fromIds = [...new Set(from.map((r) => r.marketer?.memberId).filter((x): x is number => typeof x === "number"))];
    return [
      { label: "Reassign to another marketer...", onSelect: () => setDialog({ kind: "reassign", ids, fromIds }) },
      { label: "Set backup marketer...", onSelect: () => setDialog({ kind: "backup", ids, marketerId: fromIds.length === 1 ? fromIds[0] : null }) },
      { label: "Remove backup marketer", onSelect: () => void patch(ids, { clearBackup: true }, "removed the backup of") },
      { separator: true },
      { heading: "Priority" },
      { label: "High", onSelect: () => void patch(ids, { priority: "HIGH" }, "set high priority on") },
      { label: "Medium", onSelect: () => void patch(ids, { priority: "MEDIUM" }, "set medium priority on") },
      { label: "Low", onSelect: () => void patch(ids, { priority: "LOW" }, "set low priority on") },
      { separator: true },
      { label: "Pause", onSelect: () => void patch(ids, { status: "PAUSED" }, "paused") },
      { label: "Resume", onSelect: () => void patch(ids, { status: "ACTIVE" }, "resumed") },
      { separator: true },
      { label: "Unassign", onSelect: () => void unassign(ids), danger: true },
    ];
  };

  const rowMenu = (row: Row): MenuEntry[] => actionsFor([row.consultantId], [row]);
  const bulkMenu: MenuEntry[] = useMemo(() => {
    if (selected.size === 0) return [{ label: "Select consultants in the table first", onSelect: () => undefined, disabled: true }];
    const chosen = rows.filter((r) => selected.has(r.consultantId));
    return [{ heading: `${selected.size} selected` }, ...actionsFor([...selected], chosen)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, rows]);

  /* ── render ───────────────────────────────────────────────────────────────────── */

  const marketerList = marketers.status === "ok" ? marketers.data.items : [];
  const canManage = mayManage && (marketers.status !== "ok" || marketers.data.canManage);
  const nameOf = (id: number | null) => marketerList.find((m) => m.memberId === id)?.name ?? "this marketer";
  const reassign = dialog.kind === "reassign" ? dialog : null;
  const backup = dialog.kind === "backup" ? dialog : null;

  return (
    <div data-marketing-assignments-page className="space-y-4">
      <PageHeader title="Marketing Assignments" subtitle="Assign consultants to marketing specialists and manage workloads, coverage, and performance." />

      <KpiRow kpis={kpis.data} loading={kpis.status === "loading"} error={kpis.status === "error"} onRetry={() => void loadKpis()} orgName={orgName} />

      <div className="grid grid-cols-1 gap-4 min-[1400px]:grid-cols-[minmax(0,0.31fr)_minmax(0,0.69fr)]">
        <MarketersPanel
          state={marketers}
          selectedId={marketer?.memberId ?? null}
          onSelect={pickMarketer}
          query={query.mq}
          onQuery={(mq) => setQuery((q) => ({ ...q, mq }))}
          status={query.mstatus}
          onStatus={(mstatus) => setQuery((q) => ({ ...q, mstatus }))}
          canManage={canManage}
          onAdd={() => setDialog({ kind: "add" })}
          onCapacity={(m) => setDialog({ kind: "capacity", marketer: m })}
          onTogglePause={(m) => void togglePause(m)}
          onReport={() => setDialog({ kind: "report" })}
          onRetry={() => void loadMarketers(false)}
        />
        <ConsultantsPanel
          marketer={marketer}
          state={list}
          query={query}
          onChange={change}
          filters={filters}
          canManage={canManage}
          selected={selected}
          onToggle={toggle}
          onTogglePage={togglePage}
          rowMenu={rowMenu}
          bulkMenu={bulkMenu}
          onAssign={() => setDialog({ kind: "assign" })}
          onRetry={() => void loadList(query, false)}
          moreOpen={moreOpen}
          onMore={() => setMoreOpen((o) => !o)}
        />
      </div>

      <AssignDialog open={dialog.kind === "assign"} onClose={() => setDialog({ kind: "none" })} orgId={orgId} marketer={marketer} onSubmit={(ids, force) => (marketer ? assignTo(ids, marketer.memberId, force) : Promise.resolve({ ok: false, error: "Pick a marketer first." }))} />
      <MarketerPickerDialog
        open={!!reassign}
        onClose={() => setDialog({ kind: "none" })}
        title={`Reassign ${reassign?.ids.length ?? 0} ${reassign?.ids.length === 1 ? "consultant" : "consultants"}`}
        description="Pick the marketer who takes over. You can undo it right after."
        confirmLabel="Reassign"
        marketers={marketerList}
        excludeIds={reassign?.fromIds.length === 1 ? reassign.fromIds : []}
        count={reassign?.ids.length ?? 0}
        checkCapacity
        onSubmit={(id, force) => assignTo(reassign?.ids ?? [], id, force)}
      />
      <MarketerPickerDialog
        open={!!backup}
        onClose={() => setDialog({ kind: "none" })}
        title="Set backup marketer"
        description={`Who covers for ${nameOf(backup?.marketerId ?? null)} when they are away.`}
        confirmLabel="Set backup"
        marketers={marketerList}
        excludeIds={backup?.marketerId != null ? [backup.marketerId] : []}
        count={backup?.ids.length ?? 0}
        checkCapacity={false}
        onSubmit={(id) => patch(backup?.ids ?? [], { backupMemberId: id }, "set the backup of")}
      />
      <AddMarketerDialog
        open={dialog.kind === "add"}
        onClose={() => setDialog({ kind: "none" })}
        orgId={orgId}
        inviteHref={can("members.invite") ? `/w/${workspace}/invitations?invite=1` : null}
        onAdded={(name) => {
          toast({ title: `${name} is now a marketer`, variant: "success" });
          refresh();
        }}
      />
      <CapacityDialog open={dialog.kind === "capacity"} onClose={() => setDialog({ kind: "none" })} marketer={dialog.kind === "capacity" ? (marketerList.find((m) => m.memberId === dialog.marketer.memberId) ?? dialog.marketer) : null} onSave={(c) => (dialog.kind === "capacity" ? setCapacity(marketerList.find((m) => m.memberId === dialog.marketer.memberId) ?? dialog.marketer, c) : Promise.resolve({ ok: false, error: "No marketer." }))} />
      <WorkloadDialog open={dialog.kind === "report"} onClose={() => setDialog({ kind: "none" })} orgId={orgId} />
    </div>
  );
}
