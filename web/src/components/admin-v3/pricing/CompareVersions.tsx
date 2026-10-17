"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, ChevronLeftIcon, ErrorState, Select, Skeleton, StatePill } from "@kiwiply/ui";
import { AdminHero, AdminPanel } from "../common";
import { adminFetch } from "@/lib/admin-client";
import { INTERVAL_LABEL, bpText, statusLabel, type CompareResult, type Plan } from "@/lib/admin-plans";
import { PLAN_DOMAIN } from "./planStates";
import SubscribersPanel from "./SubscribersPanel";
import VersionDiff from "./VersionDiff";

const CURRENCY = "USD"; // config-literal-ok: the compare answer carries no currency; amounts are labelled with the one currency the catalog is priced in

function Side({ title, version, status, subscribers, margins }: { title: string; version: number; status: string; subscribers: number; margins: Record<string, number> }) {
  const intervals = Object.entries(margins);
  return (
    <div className="rounded-xl border border-line bg-paper p-3 text-[13px]" data-side={title}>
      <p className="flex items-center gap-2 font-semibold text-ink">
        v{version} <StatePill domain={PLAN_DOMAIN} state={status} label={statusLabel(status)} />
      </p>
      <p className="mt-1 tabular-nums">
        <span className="font-semibold">{subscribers.toLocaleString("en-US")}</span> subscribers
      </p>
      <div className="mt-1 text-v2-muted">
        Worst-case margin:{" "}
        {intervals.length === 0 ? (
          "not available (a price is missing)"
        ) : (
          <ul className="inline">
            {intervals.map(([i, bp], idx) => (
              <li key={i} className="inline tabular-nums">
                {idx > 0 && " · "}
                {INTERVAL_LABEL[i] ?? i} {bpText(bp)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Compare two versions of a plan (K4.5; 04 section 8): a read-only two-sided summary (subscribers, worst-case margin per interval)
 * and the server's differences, one row each, before then after. Stacked on a phone. The version pickers keep the choice in the URL.
 */
export default function CompareVersions({ plan, a, b, counts }: { plan: Plan; a: number; b: number; counts: Record<string, number> }) {
  const router = useRouter();
  const [answer, setAnswer] = useState<{ key: string; data: CompareResult | null; error: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const versions = plan.versions.map((v) => v.version).sort((x, y) => y - x);
  const status = (n: number) => plan.versions.find((v) => v.version === n)?.status ?? "";
  // an answer belongs to the question it was asked for; another question (new versions, a retry) shows the skeleton again
  const key = `${plan.planKey}:${a}:${b}:${attempt}`;
  const current = answer?.key === key ? answer : null;
  const data = current?.data ?? null;
  const error = current?.error ?? null;

  useEffect(() => {
    let cancelled = false;
    void adminFetch<CompareResult>("GET", `/plans/${plan.planKey}/compare?a=${a}&b=${b}`).then((res) => {
      if (cancelled) return;
      setAnswer(res.ok ? { key, data: res.data, error: null } : { key, data: null, error: res.error });
    });
    return () => {
      cancelled = true;
    };
  }, [plan.planKey, a, b, key]);

  const pick = (which: "a" | "b", v: string) => router.replace(`/admin/pricing/plans/${plan.planKey}/compare?a=${which === "a" ? v : a}&b=${which === "b" ? v : b}`);
  const options = versions.map((v) => ({ value: String(v), label: `v${v} · ${statusLabel(status(v)).toLowerCase()}` }));

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <AdminHero
        eyebrow="PRICING"
        title={`${plan.name}: compare versions`}
        subtitle="What changed between two versions, and how many people are on each. Read only."
        actions={
          <Link href="/admin/pricing/plans" className="inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-v2-blue-ink hover:underline sm:min-h-0">
            <ChevronLeftIcon size={14} /> Plans
          </Link>
        }
      />
      <AdminPanel title="Versions">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-[12.5px] font-semibold text-ink">
            <span className="mb-1 block">From</span>
            <Select value={String(a)} onChange={(v) => pick("a", v)} options={options} aria-label="Compare from version" />
          </label>
          <label className="text-[12.5px] font-semibold text-ink">
            <span className="mb-1 block">To</span>
            <Select value={String(b)} onChange={(v) => pick("b", v)} options={options} aria-label="Compare to version" />
          </label>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {data ? (
            <>
              <Side title="from" version={data.a} status={status(data.a)} subscribers={data.subscribers.a ?? 0} margins={data.marginByIntervalA} />
              <Side title="to" version={data.b} status={status(data.b)} subscribers={data.subscribers.b ?? 0} margins={data.marginByIntervalB} />
            </>
          ) : error ? null : (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          )}
        </div>
      </AdminPanel>
      <AdminPanel title="What changed">
        {error ? (
          <ErrorState what="the comparison" description={error} onRetry={() => setAttempt((n) => n + 1)} variant="inline" />
        ) : data ? (
          <VersionDiff diff={data.diff} aLabel={`v${data.a}`} bLabel={`v${data.b}`} currency={CURRENCY} />
        ) : (
          <div role="status" aria-label="Loading the comparison" className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
      </AdminPanel>
      <AdminPanel
        title="Subscribers by version"
        description="Publishing never moves anyone: each subscriber stays on the version they bought."
        right={
          <Button type="button" variant="ghost" disabled title="Retiring a plan needs the retirement wizard (K10), which has no API route yet." className="min-h-11 sm:min-h-0">
            Retire…
          </Button>
        }
      >
        <SubscribersPanel plan={plan} counts={counts} />
      </AdminPanel>
    </div>
  );
}
