"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, CheckCircleIcon, ClockIcon, ErrorState, MoneyText, StatePill, UsersIcon, XCircleIcon, RefreshIcon, ArrowRightIcon } from "@kiwiply/ui";
import { AdminFilterBar, AdminHero, AdminPanel, AdminSaveProvider, AdminStatTiles, AdminTable, BarLineChart, useAdminSave } from "../common";
import type { AdminColumn } from "../common";
import { PLAN_DOMAIN } from "./planStates";
import { adminFetch } from "@/lib/admin-client";
import { INTERVAL_LABEL } from "@/lib/admin-plans";
import { useListQuery } from "@/lib/list-query";
import { ITEM_STATUS_LABEL, MODE_LABEL, OUTCOME_LABEL, type RetirementDetail, type RetirementItem } from "@/lib/admin-retirements";

const n = (x: number) => x.toLocaleString("en-US");
const dateText = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso)) : "—");
const TARGET = "min-h-11 sm:min-h-0";

/**
 * Progress of one retirement (K10.9; 11 section 11): the outcome tiles, MRR retained against at risk, decisions over time, the rows with their
 * actions (resend a notice, exclude with a reason, open the subscriber), and the HIGH actions cancel (typed plan key, only while nobody has acted) and
 * close. Every figure is a field of `GET /api/admin/retirements/{id}`; the page re-reads it after each action.
 */
export default function RetirementProgress({ initial }: { initial: RetirementDetail }) {
  return (
    <AdminSaveProvider>
      <Inner initial={initial} />
    </AdminSaveProvider>
  );
}

function Inner({ initial }: { initial: RetirementDetail }) {
  const a = useAdminSave();
  const [r, setR] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const list = useListQuery<RetirementItem>(`/api/admin/retirements/${r.id}/items`, { size: 25, idKey: "id", filters: { status: undefined, interval: undefined, scope: undefined } });

  async function reload() {
    const res = await adminFetch<RetirementDetail>("GET", `/retirements/${r.id}`);
    if (res.ok) setR(res.data);
    else setError(res.error);
    list.refetch();
  }

  const cancel = () =>
    a.askConfirmTyped({
      title: `Cancel the retirement of ${r.planName}?`,
      body: "Subscribers stop receiving notices and the plan goes back on sale. Only possible while nobody has acted on it.",
      confirmLabel: "Cancel retirement",
      expected: r.planKey,
      expectedLabel: "plan key",
      placeholder: "Why this retirement is being cancelled",
      run: async (reason) => {
        const res = await adminFetch("POST", `/retirements/${r.id}/cancel`, { reason, confirmPlanKey: r.planKey });
        if (res.ok) await reload();
        return res.ok ? { ok: true } : res;
      },
    });

  const close = () =>
    a.askReason({
      title: `Close the retirement of ${r.planName}?`,
      body: "Every subscriber has moved, fallen back or cancelled. The plan becomes retired and read-only for good.",
      confirmLabel: "Close retirement",
      tone: "primary",
      placeholder: "Why it is safe to close",
      run: async (reason) => {
        const res = await adminFetch("POST", `/retirements/${r.id}/close`, { reason });
        if (res.ok) await reload();
        return res.ok ? { ok: true } : res;
      },
    });

  const exclude = (row: RetirementItem) =>
    a.askReason({
      title: `Exclude ${row.login}?`,
      body: "They keep the plan and no longer get notices. This does not move them anywhere.",
      confirmLabel: "Exclude",
      placeholder: "Why this subscriber is excluded",
      run: async (reason) => {
        const res = await adminFetch("POST", `/retirements/${r.id}/items/${row.id}/exclude`, { reason });
        if (res.ok) await reload();
        return res.ok ? { ok: true } : res;
      },
    });

  async function resend(row: RetirementItem) {
    const res = await adminFetch("POST", `/retirements/${r.id}/items/${row.id}/resend`, {});
    if (!res.ok) setError(res.error);
    else list.refetch();
  }

  const columns = useMemo<AdminColumn<RetirementItem>[]>(
    () => [
      {
        key: "login",
        header: r.hasOrgItems ? "Subscriber or organization" : "Subscriber",
        primary: true,
        render: (x) => (
          <span className="block leading-tight">
            <span className="block truncate font-semibold text-ink">{x.orgName ?? x.login}</span>
            <span className="block truncate text-[12px] text-v2-muted">{x.uses.join(" · ") || "—"}</span>
          </span>
        ),
      },
      { key: "interval", header: "Period", hideOnMobile: true, render: (x) => INTERVAL_LABEL[x.interval] ?? x.interval },
      { key: "effective", header: "Effective", render: (x) => dateText(x.effectiveAt) },
      { key: "status", header: "Status", render: (x) => <span className="text-[13px] font-medium text-ink">{ITEM_STATUS_LABEL[x.status] ?? x.status}</span> },
      { key: "successor", header: "Suggested", hideOnMobile: true, render: (x) => x.successorName ?? "—" },
      { key: "delta", header: "Change", hideOnMobile: true, render: (x) => (x.deltaMinor == null ? "—" : <MoneyText minor={x.deltaMinor} currency={x.currency} />) },
      { key: "notice", header: "Last notice", hideOnMobile: true, render: (x) => (x.lastNoticeDays == null ? "None yet" : `${x.lastNoticeDays} days before`) },
    ],
    [r.hasOrgItems],
  );

  const c = r.counts;
  const points = r.decisionsOverTime;
  const top = Math.max(1, ...points.map((p) => p.cumulative), ...points.map((p) => p.switched));

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <AdminHero
        eyebrow="PRICING"
        title={`Retirement of ${r.planName}`}
        subtitle={`${MODE_LABEL[r.mode]} · if no response: ${OUTCOME_LABEL[r.defaultOutcome]} · started ${dateText(r.startedAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatePill domain={PLAN_DOMAIN} state={r.status === "COMPLETED" ? "RETIRED" : r.status === "CANCELLED" ? "PUBLISHED" : "RETIRING"} label={r.status.charAt(0) + r.status.slice(1).toLowerCase()} />
            <Button type="button" variant="ghost" className={TARGET} disabled={!r.canCancel} title={r.canCancel ? undefined : "Only possible while no subscriber has acted."} onClick={cancel}>
              Cancel retirement…
            </Button>
            <Button type="button" variant="primary" className={TARGET} disabled={!r.canClose} title={r.canClose ? undefined : "Subscribers are still pending."} onClick={close}>
              Close
            </Button>
          </div>
        }
      />

      {error && <ErrorState variant="inline" what="that action" description={error} onRetry={() => setError(null)} />}

      <AdminStatTiles
        stats={[
          { label: "Pending", value: n(c.pending), icon: <ClockIcon size={26} />, tone: "amber", caption: `${dateText(r.earliestEffectiveAt)} to ${dateText(r.latestEffectiveAt)}` },
          { label: "Switched", value: n(c.switchedNow + c.switchScheduled), icon: <CheckCircleIcon size={26} />, tone: "green", caption: `${n(c.switchedNow)} now · ${n(c.switchScheduled)} scheduled` },
          { label: "Cancelled", value: n(c.cancelled), icon: <XCircleIcon size={26} />, tone: "coral" },
          { label: "Fell back to Free", value: n(c.fellBack), icon: <UsersIcon size={26} />, tone: "slate", caption: `${n(c.migrated)} moved to a successor` },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <AdminPanel title="Revenue" description="Monthly recurring revenue of this cohort, from the API." fit>
          <div className="grid grid-cols-2 gap-3" data-testid="mrr">
            <div>
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-soft">Retained</p>
              <p className="mt-1 font-display text-2xl font-extrabold text-ink">
                <MoneyText minor={r.mrrRetainedMinor} currency={r.currency} />
              </p>
            </div>
            <div>
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-soft">At risk</p>
              <p className="mt-1 font-display text-2xl font-extrabold text-ink">
                <MoneyText minor={r.mrrAtRiskMinor} currency={r.currency} />
              </p>
            </div>
          </div>
          {r.driftCount > 0 && (
            <p role="status" className="mt-3 text-[13px] text-ink-soft">
              {n(r.driftCount)} row{r.driftCount === 1 ? "" : "s"} differ from Stripe. The nightly reconciler listed them; nothing is changed for you.
            </p>
          )}
          <p className="mt-3 text-[12.5px] text-v2-muted">
            Successors: {r.successors.length > 0 ? r.successors.map((s) => `${s.rank}. ${s.name}`).join(", ") : "none"} · notices {r.noticeScheduleDays.join(", ")} days before.
          </p>
        </AdminPanel>
        <AdminPanel title="Decisions over time" description="Subscribers who switched each day, and everyone who has decided so far." fit>
          {points.length === 0 ? (
            <p className="text-[13px] text-v2-muted">Nobody has decided yet.</p>
          ) : (
            <BarLineChart bars={points.map((p) => p.switched)} line={points.map((p) => p.cumulative)} max={top} xLabels={points.map((p) => p.date.slice(5))} yLabels={["0", String(top)]} barLabel="Switched that day" lineLabel="Decided in total" />
          )}
        </AdminPanel>
      </div>

      <AdminPanel title="Subscribers" description="One row per subscription. Resend a notice, exclude someone, or open the account." fit>
        <div className="space-y-3">
          <AdminFilterBar
            list={list}
            search={false}
            filters={[
              { name: "status", label: "Status", options: Object.entries(ITEM_STATUS_LABEL).map(([value, label]) => ({ value, label })) },
              { name: "interval", label: "Period", allLabel: "Any period", options: (["MONTH", "QUARTER", "YEAR"] as const).map((i) => ({ value: i, label: INTERVAL_LABEL[i] })) },
              ...(r.hasOrgItems ? [{ name: "scope", label: "Kind", allLabel: "Personal and organizations", options: [{ value: "PERSONAL", label: "Personal" }, { value: "ORG", label: "Organizations" }] }] : []),
            ]}
          />
          <AdminTable<RetirementItem>
            list={list}
            columns={columns}
            rowKey={(x) => x.id}
            label="Retirement subscribers"
            what="subscribers"
            sheetTitle={(x) => x.orgName ?? x.login}
            rowActions={(x) => (
              <>
                <Button type="button" variant="ghost" className={TARGET} onClick={() => void resend(x)} disabled={x.status !== "PENDING"}>
                  <RefreshIcon size={14} /> Resend notice
                </Button>
                <Button type="button" variant="ghost" className={TARGET} onClick={() => exclude(x)} disabled={x.status !== "PENDING"}>
                  Exclude…
                </Button>
                {x.scope === "PERSONAL" && (
                  <Link href={`/admin/users/${encodeURIComponent(x.login)}`} className="inline-flex min-h-11 items-center gap-1 px-3 text-[13px] font-semibold text-v2-blue-ink hover:underline sm:min-h-0">
                    Open subscriber <ArrowRightIcon size={13} />
                  </Link>
                )}
              </>
            )}
            empty={{ title: "No rows", description: "This retirement has no subscribers." }}
          />
        </div>
      </AdminPanel>
    </div>
  );
}
