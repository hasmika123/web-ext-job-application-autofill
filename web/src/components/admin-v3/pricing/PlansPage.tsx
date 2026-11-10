"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet, Button, CheckIcon, ClockIcon, Dialog, Field, Input, LayersIcon, MoneyText, PlusIcon, Select, StatePill, Textarea, TrendingUpIcon, UsersIcon } from "@kiwiply/ui";
import { AdminFilterBar, AdminHero, AdminPanel, AdminSaveProvider, AdminStatTiles, AdminTable, reasonOk, reasonProblem, useAdminSave, useNarrow } from "../common";
import type { AdminColumn } from "../common";
import { PLAN_DOMAIN } from "./planStates";
import { useListQuery } from "@/lib/list-query";
import { canStartRetirement, isRetiring } from "@/lib/admin-retirements";
import { adminFetch } from "@/lib/admin-client";
import {
  AUDIENCE_LABEL,
  INTERVAL_LABEL,
  PLAN_STATUSES,
  bpText,
  statusLabel,
  type Audience,
  type Interval,
  type Plan,
  type PlanSummary,
} from "@/lib/admin-plans";

const CURRENCY = "USD"; // config-literal-ok: the list rows carry no currency yet (see decisions-for-user: summary has no currency); USD is the only configured one

/** Individual and Organization plan keys: upper-case letters, digits and underscores (the API answers 422 KEY_FORMAT otherwise). */
const KEY_FORMAT = /^[A-Z][A-Z0-9_]{1,39}$/;

/**
 * Platform admin: Pricing -> Plans (K4.1; docs/subscriptions/04 section 2). Hero -> stat tiles -> filters -> table (cards on a
 * phone). A row opens the plan's live version (or its draft). Every number is a DTO field: subscriber counts, prices per
 * interval and the worst-case margin come from `GET /api/admin/plans` and nothing here adds two prices.
 */
export default function PlansPage() {
  return (
    <AdminSaveProvider>
      <Inner />
    </AdminSaveProvider>
  );
}

function prices(p: PlanSummary) {
  const rows = (["MONTH", "QUARTER", "YEAR"] as Interval[]).filter((i) => p.pricesByInterval && p.pricesByInterval[i] !== undefined);
  if (rows.length === 0) return <span className="text-v2-muted">No price</span>;
  return (
    <span className="tabular-nums">
      {rows.map((i, idx) => (
        <span key={i}>
          {idx > 0 && <span aria-hidden> · </span>}
          <MoneyText minor={p.pricesByInterval[i]} currency={CURRENCY} />
          <span className="text-v2-muted">/{i === "MONTH" ? "mo" : i === "QUARTER" ? "3 mo" : "yr"}</span>
        </span>
      ))}
    </span>
  );
}

function versionsText(p: PlanSummary) {
  const live = p.liveVersion?.version ?? null;
  const total = Object.values(p.subscribersByVersion ?? {}).reduce((a, n) => a + n, 0);
  const others = Object.entries(p.subscribersByVersion ?? {}).filter(([v, n]) => String(live) !== v && n > 0);
  return { live, total, others };
}

function Inner() {
  const router = useRouter();
  const a = useAdminSave();
  const list = useListQuery<PlanSummary>("/api/admin/plans", { size: 100, idKey: "planKey", filters: { audience: undefined, status: undefined, interval: undefined } });
  const [creating, setCreating] = useState(false);
  const s = list.summary;

  const open = (p: PlanSummary) => {
    const v = p.draftVersion ?? p.liveVersion?.version ?? 1;
    router.push(`/admin/pricing/plans/${p.planKey}/v/${v}`);
  };

  const newVersion = (p: PlanSummary) =>
    a.askReason({
      title: `Start a new version of ${p.name}?`,
      body: `A new draft is copied from ${p.liveVersion ? `v${p.liveVersion.version}` : "the latest version"}. Nothing reaches customers until you publish it.`,
      confirmLabel: "Start draft",
      tone: "primary",
      placeholder: "Why this plan needs a new version",
      run: async (reason) => {
        const res = await adminFetch<{ version: number }>("POST", `/plans/${p.planKey}/versions`, { reason });
        if (!res.ok) return res;
        router.push(`/admin/pricing/plans/${p.planKey}/v/${res.data.version}`);
        return { ok: true };
      },
    });

  const columns = useMemo<AdminColumn<PlanSummary>[]>(
    () => [
      {
        key: "name",
        header: "Plan",
        primary: true,
        render: (p) => (
          <span className="block leading-tight">
            <span className="block truncate font-semibold text-ink">{p.name}</span>
            <span className="block truncate text-[12px] text-v2-muted">{p.planKey}</span>
          </span>
        ),
      },
      { key: "audience", header: "Audience", hideOnMobile: true, render: (p) => AUDIENCE_LABEL[p.audience] ?? p.audience },
      { key: "status", header: "Status", render: (p) => <StatePill domain={PLAN_DOMAIN} state={p.status} label={statusLabel(p.status)} /> },
      {
        key: "live",
        header: "Live version",
        render: (p) => {
          const v = versionsText(p);
          return (
            <span className="tabular-nums">
              {v.live ? `v${v.live}` : p.draftVersion ? `v${p.draftVersion} draft` : "—"}
              {v.others.length > 0 && <span className="text-v2-muted"> (older: {v.others.map(([ver, n]) => `v${ver}: ${n.toLocaleString("en-US")}`).join(", ")})</span>}
            </span>
          );
        },
      },
      { key: "subs", header: "Subscribers", render: (p) => versionsText(p).total.toLocaleString("en-US") },
      { key: "price", header: "Price", sub: true, render: prices },
      { key: "margin", header: "Margin worst", render: (p) => (p.marginWorstBp == null ? "—" : bpText(p.marginWorstBp)) },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <AdminHero
        eyebrow="PRICING"
        title="Plans"
        subtitle="Every plan, its live version and who is on which version. Publishing a version never changes anyone already subscribed."
        actions={
          <Button type="button" variant="primary" onClick={() => setCreating(true)} className="min-h-11 gap-1.5 sm:min-h-0">
            <PlusIcon size={16} /> New plan
          </Button>
        }
      />

      {s && (
        <AdminStatTiles
          stats={[
            { label: "Plans", value: (s.plans ?? 0).toLocaleString("en-US"), icon: <LayersIcon size={26} />, tone: "blue" },
            { label: "Published", value: (s.published ?? 0).toLocaleString("en-US"), icon: <CheckIcon size={26} />, tone: "green", caption: `${s.drafts ?? 0} draft · ${s.sunset ?? 0} sunset` },
            { label: "Drafts", value: (s.drafts ?? 0).toLocaleString("en-US"), icon: <TrendingUpIcon size={26} />, tone: "violet" },
            {
              label: "On older versions",
              value: (s.oldVersionSubscribers ?? 0).toLocaleString("en-US"),
              icon: s.oldVersionSubscribers ? <UsersIcon size={26} /> : <ClockIcon size={26} />,
              tone: "amber",
              caption: "subscribers kept on a past version",
            },
          ]}
        />
      )}

      <AdminPanel title="All plans" description="A row opens the draft if there is one, otherwise the live version.">
        <div className="space-y-3">
          <AdminFilterBar
            list={list}
            search={{ placeholder: "Search key or name" }}
            filters={[
              { name: "audience", label: "Audience", options: Object.entries(AUDIENCE_LABEL).map(([value, label]) => ({ value, label })) },
              { name: "status", label: "Status", options: PLAN_STATUSES.map((st) => ({ value: st, label: statusLabel(st) })) },
              { name: "interval", label: "Interval", allLabel: "Any interval", options: (["MONTH", "QUARTER", "YEAR"] as const).map((i) => ({ value: i, label: INTERVAL_LABEL[i] })) },
            ]}
          />
          <AdminTable<PlanSummary>
            list={list}
            columns={columns}
            rowKey={(p) => p.planKey}
            label="Plans"
            what="plans"
            sheetTitle={(p) => p.name}
            onRowClick={open}
            rowActions={(p) => (
              <>
                <Button type="button" variant="ghost" onClick={() => open(p)} className="min-h-11 sm:min-h-0">
                  Open
                </Button>
                {p.draftVersion == null && (
                  <Button type="button" variant="ghost" onClick={() => newVersion(p)} className="min-h-11 sm:min-h-0">
                    New version
                  </Button>
                )}
                {Object.keys(p.subscribersByVersion ?? {}).length + (p.draftVersion ? 1 : 0) > 1 && (
                  <Button type="button" variant="ghost" onClick={() => router.push(`/admin/pricing/plans/${p.planKey}/compare`)} className="min-h-11 sm:min-h-0">
                    Compare versions
                  </Button>
                )}
                {isRetiring(p.status) ? (
                  <Button type="button" variant="ghost" onClick={() => router.push(`/admin/pricing/plans/${p.planKey}/retirements`)} className="min-h-11 sm:min-h-0">
                    Retirement progress
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={!canStartRetirement(p.status)}
                    title={canStartRetirement(p.status) ? undefined : "Only a published plan can be retired."}
                    onClick={() => router.push(`/admin/pricing/plans/${p.planKey}/retire`)}
                    className="min-h-11 sm:min-h-0"
                  >
                    Retire…
                  </Button>
                )}
                <Button type="button" variant="ghost" disabled title="Duplicate as… is not built yet." className="min-h-11 sm:min-h-0">
                  Duplicate as…
                </Button>
              </>
            )}
            empty={{
              title: "No plans yet",
              description: "Create Free first, then the paid plans.",
              action: (
                <Button type="button" variant="primary" onClick={() => setCreating(true)} className="min-h-11 sm:min-h-0">
                  <PlusIcon size={16} /> Create Free first
                </Button>
              ),
            }}
          />
        </div>
      </AdminPanel>

      <CreatePlanSheet open={creating} onClose={() => setCreating(false)} onCreated={(p) => router.push(`/admin/pricing/plans/${p.planKey}/v/1`)} />
    </div>
  );
}

/** New plan: key, name, audience and the reason every HIGH catalog write carries. Version 1 starts as a DRAFT. */
export function CreatePlanSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (p: Plan) => void }) {
  const narrow = useNarrow();
  const [planKey, setPlanKey] = useState("");
  const [name, setName] = useState("");
  const [audience, setAudience] = useState<Audience>("INDIVIDUAL");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyOk = KEY_FORMAT.test(planKey);
  const ready = keyOk && name.trim().length > 0 && reasonOk(reason) && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await adminFetch<Plan>("POST", "/plans", { planKey, name: name.trim(), audience, reason: reason.trim() });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onCreated(res.data);
  }

  const form = (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) void submit();
      }}
    >
      <Field label="Plan key" hint="Upper-case letters, digits and underscores. It never changes after the first publish." error={planKey && !keyOk ? "Use 2 to 40 characters: A-Z, 0-9 and _, starting with a letter." : undefined}>
        <Input value={planKey} onChange={(e) => setPlanKey(e.target.value.toUpperCase())} placeholder="PRO_STUDENT" autoComplete="off" />
      </Field>
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pro Student" />
      </Field>
      <Field label="Audience" hint="Fixed after creation.">
        <Select
          value={audience}
          onChange={(v) => setAudience(v as Audience)}
          options={Object.entries(AUDIENCE_LABEL).map(([value, label]) => ({ value, label }))}
          aria-label="Audience"
        />
      </Field>
      <Field label="Reason" hint="Recorded in the audit log." error={reasonProblem(reason) ?? undefined}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why this plan is needed" />
      </Field>
      {error && (
        <p role="alert" className="text-[13px] text-danger-text">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onClose} className="min-h-11 sm:min-h-0">
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!ready} className="min-h-11 sm:min-h-0">
          Create draft
        </Button>
      </div>
    </form>
  );

  if (narrow) {
    return (
      <BottomSheet open={open} onClose={onClose} title="New plan" id="create-plan-sheet">
        {form}
      </BottomSheet>
    );
  }
  return (
    <Dialog open={open} onClose={onClose} title="New plan" description="Starts as version 1 in draft. Nothing is sold until you publish.">
      {form}
    </Dialog>
  );
}
