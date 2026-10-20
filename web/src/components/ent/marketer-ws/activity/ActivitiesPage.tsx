"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowsUpDownIcon, Button, ClipboardIcon, ErrorState, PlusIcon, Select, cn } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import {
  PAGE_SIZE, SORT_LABEL, fetchActivity, logActivity, setActivityStatus,
  type ActivityRow, type ActivityView, type Filters, type LogInput, type SortKey,
} from "@/lib/ent/marketer-ws/activity";
import { CARD, CardSkeleton, Empty, Head, type MktPageProps } from "../parts";
import ActivityTable, { type RowAction } from "./ActivityTable";
import DateRangePicker from "./DateRangePicker";
import DetailsDialog from "./DetailsDialog";
import LogDialog from "./LogDialog";

/**
 * Activity. One call draws the board: the filter row and the feed (the unified list of what the marketer's side did, plus manually logged rows). ASSIGNED scope. E1: "Log activity" only RECORDS a row; nothing
 * is sent to a client, nothing is submitted for a consultant.
 */

const EMPTY_FILTERS: Filters = { from: "", to: "", consultantId: "", type: "", status: "", clientId: "", ownerId: "", sort: "recent", summaryRange: "THIS_MONTH", page: 0 };
const FIELD_LABEL = "mb-1 block text-[12px] font-semibold text-ink-soft";

export default function ActivitiesPage({ orgId }: MktPageProps) {
  const [view, setView] = useState<ActivityView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [refreshing, setRefreshing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [details, setDetails] = useState<ActivityRow | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (f: Filters) => {
      const mine = ++seq.current;
      const r = await fetchActivity(orgId, f);
      if (mine !== seq.current) return r.kind; // a newer request is in flight
      if (r.kind === "OK") {
        setView(r.view);
        setStatus("ready");
      } else setStatus(r.kind === "DENIED" ? "denied" : (s) => (s === "ready" ? s : "failed"));
      setRefreshing(false);
      return r.kind;
    },
    [orgId],
  );
  useEffect(() => {
    const t = setTimeout(() => void load(EMPTY_FILTERS), 0);
    return () => clearTimeout(t);
  }, [load]);

  /** Change one or more filters: the page goes back to the first one and the board reloads. */
  const change = (patch: Partial<Filters>) => {
    const next = { ...filters, page: 0, ...patch };
    setFilters(next);
    setRefreshing(true);
    void load(next);
  };
  const goPage = (page: number) => {
    const next = { ...filters, page };
    setFilters(next);
    setRefreshing(true);
    void load(next);
  };

  async function submitLog(input: LogInput) {
    setBusy(true);
    setLogError(null);
    const r = await logActivity(orgId, input);
    setBusy(false);
    if (!r.ok) {
      if (r.denied) setStatus("denied");
      else setLogError(r.message);
      return;
    }
    setLogging(false);
    setNotice({ tone: "ok", text: "Activity logged. Nothing was sent to anyone." });
    setRefreshing(true);
    void load(filters);
  }

  async function rowAction(row: ActivityRow, a: RowAction) {
    if (a.kind === "details") {
      setDetails(row);
      return;
    }
    const r = await setActivityStatus(orgId, row.id, a.status);
    if (!r.ok) {
      if (r.denied) setStatus("denied");
      else setNotice({ tone: "warn", text: r.message });
      return;
    }
    setNotice({ tone: "ok", text: "Activity updated." });
    setRefreshing(true);
    void load(filters);
  }

  if (status === "denied") return <ErrorState what="the Activity page" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  const header = <PageHeader title="Activity" subtitle="Everything you and your consultants did, newest first." />;
  if (status === "failed")
    return (
      <div data-activity-page data-status="failed">
        {header}
        <ErrorState what="your activity" description="Your activity didn't load. Nothing has changed." onRetry={() => void load(filters)} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      </div>
    );

  const loading = status === "loading";
  const v = view;
  const opts = v?.options;
  const all = (label: string) => ({ value: "", label });
  const total = v?.activities.total ?? 0;
  const size = v?.activities.size ?? PAGE_SIZE;
  const page = v?.activities.page ?? 0;
  const firstShown = total === 0 ? 0 : page * size + 1;
  const lastShown = Math.min(total, page * size + (v?.activities.items.length ?? 0));
  const filtered = filters.consultantId !== "" || filters.type !== "" || filters.status !== "" || filters.clientId !== "";

  return (
    <div data-activity-page data-status={status} className="flex flex-col gap-4 sm:gap-5">
      {header}

      {notice ? (
        <p role="status" data-activity-notice className={cn("rounded-lg border px-3 py-2 text-[13px] font-medium", notice.tone === "ok" ? "border-line bg-v2-green-soft text-v2-green-ink" : "border-line bg-v2-amber-soft text-v2-amber-ink")}>
          {notice.text}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 sm:gap-5">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <section aria-label="Filters" data-activity-filters className="grid grid-cols-1 gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-3.5 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <span className={FIELD_LABEL}>Date range</span>
              <DateRangePicker from={v?.from ?? ""} to={v?.to ?? ""} onChange={(from, to) => change({ from, to })} />
            </div>
            <label className="block">
              <span className={FIELD_LABEL}>Consultant</span>
              <Select aria-label="Consultant" value={filters.consultantId} onChange={(x) => change({ consultantId: x })} options={[all("All consultants"), ...(opts?.consultants ?? []).map((c) => ({ value: String(c.id), label: c.name }))]} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Activity type</span>
              <Select aria-label="Activity type" value={filters.type} onChange={(x) => change({ type: x })} options={[all("All types"), ...(opts?.types ?? []).map((t) => ({ value: t.key, label: t.label }))]} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Status</span>
              <Select aria-label="Status" value={filters.status} onChange={(x) => change({ status: x })} options={[all("All statuses"), ...(opts?.statuses ?? []).map((t) => ({ value: t.key, label: t.label }))]} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Client</span>
              <Select aria-label="Client" value={filters.clientId} onChange={(x) => change({ clientId: x })} options={[all("All clients"), ...(opts?.clients ?? []).map((c) => ({ value: String(c.id), label: c.name }))]} />
            </label>
          </section>

          <section data-activity-card="feed" className={cn(CARD, refreshing && "opacity-70")} aria-busy={refreshing}>
            <Head icon={ClipboardIcon} title="Activity" count={loading ? undefined : total}>
              <Select
                variant="pill"
                aria-label="Sort"
                value={filters.sort}
                leadingIcon={<ArrowsUpDownIcon size={15} />}
                onChange={(x) => change({ sort: x as SortKey })}
                options={(Object.keys(SORT_LABEL) as SortKey[]).map((k) => ({ value: k, label: SORT_LABEL[k] }))}
              />
              {v?.canLog ? (
                <Button variant="accent" size="sm" onClick={() => { setLogError(null); setLogging(true); }} className="h-10">
                  <PlusIcon size={16} />
                  Log activity
                </Button>
              ) : null}
            </Head>
            {loading ? (
              <CardSkeleton rows={6} />
            ) : (v?.activities.items.length ?? 0) === 0 ? (
              <Empty>{filtered ? "No activities match these filters." : "No activity yet"}</Empty>
            ) : (
              <>
                <ActivityTable rows={v?.activities.items ?? []} canLog={v?.canLog === true} onAction={(r, a) => void rowAction(r, a)} />
                {total > size ? (
                  <nav aria-label="Pages" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
                    <span data-activity-range>{`Showing ${firstShown} to ${lastShown} of ${total} activities`}</span>
                    <span className="flex gap-2">
                      <Button variant="ghost" size="sm" disabled={page === 0 || refreshing} onClick={() => goPage(page - 1)}>
                        Previous
                      </Button>
                      <Button variant="ghost" size="sm" disabled={lastShown >= total || refreshing} onClick={() => goPage(page + 1)}>
                        Next
                      </Button>
                    </span>
                  </nav>
                ) : null}
              </>
            )}
          </section>
        </div>
      </div>

      {logging && opts ? <LogDialog open options={opts} busy={busy} error={logError} onClose={() => setLogging(false)} onSubmit={(i) => void submitLog(i)} /> : null}
      {details ? <DetailsDialog row={details} onClose={() => setDetails(null)} /> : null}
    </div>
  );
}
