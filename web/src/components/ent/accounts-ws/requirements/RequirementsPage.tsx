"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertIcon, BriefcaseIcon, Button, ClipboardCheckIcon, ClockIcon, EmptyState, ErrorState, Input, MapPinIcon, PlusIcon, Select, Skeleton, UsersIcon, useToast } from "@kiwiply/ui";
import PageHeader, { ClaimsMascot } from "@/components/ent/shell/ShellContext";
import TalentPagination from "@/components/ent/shell/TalentPagination";
import { KpiTile } from "../../marketer-ws/parts";
import {
  ageText, dueText, hasFilters, PAGE_SIZES, PRIORITY_OPTIONS, priorityLabel, rateText, requirementsApi, showingText, STATUS_OPTIONS, statusLabel, workModeLabel, DEFAULT_QUERY,
  type ReqDetail, type ReqPage, type ReqQuery, type ReqRow, type ReqSummary, type SortKey,
} from "@/lib/ent/accounts-ws/requirements";
import { PriorityPill, StatusPill, type AccountsPageProps } from "../parts";
import RequirementDialog from "./RequirementDialog";
import RequirementDrawer from "./RequirementDrawer";

/**
 * Requirements (Account Manager): what the clients asked for. Four tiles, filters, a list that is a table on a desktop and cards on a phone (390 px),
 * the detail drawer, and Add requirement (typed in, pasted client text, or a posting link). Business data only; the API scans every text field.
 * E1: putting a requirement in front of a consultant RECORDS it. The consultant decides; nothing is applied or sent for anyone.
 */

const SORTS: { value: SortKey; label: string }[] = [
  { value: "posted", label: "Newest first" },
  { value: "due", label: "Needed by" },
  { value: "priority", label: "Priority" },
  { value: "age", label: "Oldest open" },
  { value: "title", label: "Title" },
  { value: "client", label: "Client" },
];
const ASC_FIRST = new Set<SortKey>(["due", "title", "client"]);

type Phase = "loading" | "ready" | "failed" | "denied";

export default function RequirementsPage({ orgId }: AccountsPageProps) {
  const toast = useToast();
  const [query, setQuery] = useState<ReqQuery>(DEFAULT_QUERY);
  const [typed, setTyped] = useState("");
  const [page, setPage] = useState<ReqPage | null>(null);
  const [summary, setSummary] = useState<ReqSummary | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [openId, setOpenId] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const [dialog, setDialog] = useState<{ editing: ReqDetail | null } | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (q: ReqQuery) => {
      const mine = ++seq.current;
      const [list, sum] = await Promise.all([requirementsApi.list(orgId, q), requirementsApi.summary(orgId)]);
      if (mine !== seq.current) return;
      if (!list.ok) {
        if (list.status === 404) setPhase("denied");
        else setPhase((p) => (p === "ready" ? p : "failed"));
        return;
      }
      setPage(list.data);
      if (sum.ok) setSummary(sum.data);
      setPhase("ready");
    },
    [orgId],
  );

  useEffect(() => {
    const t = setTimeout(() => void load(query), 0);
    return () => clearTimeout(t);
  }, [load, query]);

  // the search box waits for a pause in typing before it asks the server
  useEffect(() => {
    const t = setTimeout(() => setQuery((q) => (q.q === typed ? q : { ...q, q: typed, page: 0 })), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const refresh = () => {
    setReload((n) => n + 1);
    void load(query);
  };
  const patchQuery = (p: Partial<ReqQuery>) => setQuery((q) => ({ ...q, ...p, page: p.page ?? 0 }));
  const clear = () => {
    setTyped("");
    setQuery({ ...DEFAULT_QUERY, size: query.size });
  };

  if (phase === "denied") return <ErrorState what="the Requirements page" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  const header = (
    <>
      <PageHeader title="Requirements" subtitle="What your clients asked for: enter it, keep it moving, and put it in front of the right consultants." />
      <ClaimsMascot />
    </>
  );
  if (phase === "failed") {
    return (
      <div data-requirements-page data-status="failed">
        {header}
        <ErrorState what="your requirements" description="Your requirements didn't load. Nothing has changed." onRetry={() => void load(query)} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      </div>
    );
  }

  const loading = phase === "loading";
  const canCreate = !!summary?.access.canCreate;
  const rows = page?.items ?? [];
  const filtered = hasFilters(query);

  return (
    <div data-requirements-page data-status={phase} className="flex flex-col gap-4 sm:gap-5">
      {header}

      <section aria-label="Key numbers" data-requirements-tiles className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <TileButton label="Show open requirements" onPick={() => patchQuery({ status: "OPEN", assigned: "", aging: false })}>
          <KpiTile id="open" title="Open requirements" icon={BriefcaseIcon} tint="blue" value={summary?.open ?? 0} loading={loading} layout="inline" />
        </TileButton>
        <TileButton label="Show requirements without a consultant" onPick={() => patchQuery({ status: "OPEN", assigned: "NONE", aging: false })}>
          <KpiTile id="unassigned" title="Without a consultant" icon={UsersIcon} tint="coral" value={summary?.unassigned ?? 0} loading={loading} layout="inline" lowerIsBetter />
        </TileButton>
        <TileButton label="Show aging requirements" onPick={() => patchQuery({ status: "", assigned: "", aging: true })}>
          <KpiTile id="aging" title={`Aging (${summary?.agingDays ?? 14}+ days)`} icon={ClockIcon} tint="amber" value={summary?.aging ?? 0} loading={loading} layout="inline" lowerIsBetter />
        </TileButton>
        <TileButton label="Show requirements on hold" onPick={() => patchQuery({ status: "ON_HOLD", assigned: "", aging: false })}>
          <KpiTile id="onHold" title="On hold" icon={AlertIcon} tint="violet" value={summary?.onHold ?? 0} loading={loading} layout="inline" />
        </TileButton>
      </section>

      <section aria-label="Requirements" className="min-w-0 rounded-[var(--radius-lg)] border border-line bg-paper p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <div className="min-w-[12rem] flex-1">
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search title, client, location or skill" aria-label="Search requirements" maxLength={80} />
          </div>
          {canCreate && (
            <Button type="button" onClick={() => setDialog({ editing: null })} data-add-requirement>
              <PlusIcon size={16} aria-hidden /> Add requirement
            </Button>
          )}
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6" data-requirement-filters>
          <Select value={query.status} onChange={(v) => patchQuery({ status: v })} aria-label="Status" options={[{ value: "", label: "Any status" }, ...STATUS_OPTIONS.map((s) => ({ value: s, label: statusLabel(s) }))]} />
          <Select value={query.priority} onChange={(v) => patchQuery({ priority: v })} aria-label="Priority" options={[{ value: "", label: "Any priority" }, ...PRIORITY_OPTIONS.map((p) => ({ value: p, label: priorityLabel(p) }))]} />
          <Select value={query.clientId} onChange={(v) => patchQuery({ clientId: v })} aria-label="Client" options={[{ value: "", label: "Any client" }, ...(summary?.clientOptions ?? []).map((c) => ({ value: String(c.id), label: c.name }))]} />
          <Select value={query.assigned} onChange={(v) => patchQuery({ assigned: v })} aria-label="Consultants" options={[{ value: "", label: "Any consultants" }, { value: "NONE", label: "Without a consultant" }, { value: "ANY", label: "With a consultant" }]} />
          <Select
            value={query.aging ? "AGING" : ""}
            onChange={(v) => patchQuery({ aging: v === "AGING" })}
            aria-label="Age"
            options={[{ value: "", label: "Any age" }, { value: "AGING", label: `Open ${summary?.agingDays ?? 14}+ days` }]}
          />
          <Select
            value={query.sort.key}
            onChange={(v) => patchQuery({ sort: { key: v as SortKey, dir: ASC_FIRST.has(v as SortKey) ? "asc" : "desc" } })}
            aria-label="Sort by"
            options={SORTS.map((s) => ({ value: s.value, label: s.label }))}
          />
        </div>

        {loading ? (
          <div aria-busy="true" className="space-y-3 py-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          filtered ? (
            <EmptyState
              variant="inline"
              title="No requirements match"
              description="Try a different search or clear the filters."
              action={
                <Button type="button" variant="ghost" onClick={clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<ClipboardCheckIcon size={28} aria-hidden />}
              title="No requirements yet"
              description="When a client sends you a role, add it here: typed in, pasted from their email, or from a link."
              action={
                canCreate ? (
                  <Button type="button" onClick={() => setDialog({ editing: null })}>
                    Add requirement
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <ul aria-label="Requirements list" data-requirements-list className="divide-y divide-line">
            {rows.map((r) => (
              <RequirementItem key={r.id} row={r} open={openId === r.id} onOpen={() => setOpenId(r.id)} />
            ))}
          </ul>
        )}

        {!loading && page && page.total > 0 && (
          <TalentPagination
            className="mt-3 px-1"
            page={query.page}
            size={query.size}
            total={page.total}
            showing={showingText(page.total, page.page, page.size, rows.length)}
            sizes={PAGE_SIZES}
            onPage={(p) => setQuery((q) => ({ ...q, page: p }))}
            onSize={(s) => setQuery((q) => ({ ...q, size: s, page: 0 }))}
          />
        )}
      </section>

      <RequirementDrawer orgId={orgId} requirementId={openId} reloadToken={reload} onClose={() => setOpenId(null)} onEdit={(d) => setDialog({ editing: d })} onChanged={refresh} />

      <RequirementDialog
        orgId={orgId}
        open={dialog !== null}
        editing={dialog?.editing ?? null}
        clients={summary?.clientOptions ?? []}
        onClose={() => setDialog(null)}
        onOpenExisting={(id) => {
          setDialog(null);
          setOpenId(id);
        }}
        onSaved={(d, created) => {
          setDialog(null);
          toast({ title: created ? "Requirement added" : "Changes saved", variant: "success" });
          if (created) setOpenId(d.requirement.id);
          refresh();
        }}
      />
    </div>
  );
}

/** One requirement: a card on a phone, the same markup as a row on a desktop. The whole row opens the drawer (Enter or Space too). */
function RequirementItem({ row: r, open, onOpen }: { row: ReqRow; open: boolean; onOpen: () => void }) {
  const rate = rateText(r.rate);
  return (
    <li
      data-requirement-row={r.id}
      tabIndex={0}
      aria-current={open ? "true" : undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`flex cursor-pointer flex-col gap-2 px-1 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_88px_100px_96px_92px] md:items-center md:gap-3 ${open ? "bg-accent-soft" : "hover:bg-paper-2"}`}
    >
      <div className="min-w-0">
        <h3 className="truncate text-[14.5px] font-bold leading-tight text-ink" data-requirement-title>
          {r.title}
        </h3>
        <p className="truncate text-[13px] text-ink-soft">{r.client.name}</p>
      </div>
      <div className="min-w-0 space-y-0.5 text-[12.5px] text-ink-soft">
        {(r.location || r.workMode) && (
          <p className="flex flex-wrap items-center gap-x-2">
            {r.location && (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon size={12} aria-hidden /> {r.location}
              </span>
            )}
            {r.workMode && <span>{workModeLabel(r.workMode)}</span>}
          </p>
        )}
        {rate && <p>{rate}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:contents">
        <div>
          <PriorityPill priority={r.priority} />
        </div>
        <div>
          <StatusPill status={r.status} />
        </div>
        <div className="text-[12.5px] text-ink-soft" data-consultant-count={r.consultantCount}>
          {r.consultantCount === 0 ? <span className="font-semibold text-v2-coral-ink">No consultant</span> : `${r.consultantCount} ${r.consultantCount === 1 ? "consultant" : "consultants"}`}
        </div>
        <div className="text-[12.5px] text-ink-soft">
          <p>{r.dueOn ? `By ${dueText(r.dueOn)}` : "No date"}</p>
          <p className="text-[11.5px] text-muted">{ageText(r.ageDays)} old</p>
        </div>
      </div>
    </li>
  );
}

/** A tile that is also a filter: the whole tile is the hit area (a transparent button laid over it, so no heading sits inside a button). */
function TileButton({ label, onPick, children }: { label: string; onPick: () => void; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <button type="button" aria-label={label} onClick={onPick} className="absolute inset-0 rounded-[var(--radius-lg)] focus-visible:outline-2 focus-visible:outline-accent" />
    </div>
  );
}
