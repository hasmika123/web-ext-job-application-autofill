import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";

export const metadata: Metadata = {
  title: "Analytics · Admin · Kiwiply",
  robots: { index: false, follow: false },
};

interface Funnel {
  signedUp: number;
  activated: number;
  withProfile: number;
  startedApplying: number;
  applied: number;
}
interface Billing {
  activePro: number;
  monthlyCount: number;
  threeMonthCount: number;
  mrr: number;
  newThisMonth: number;
  churnedThisMonth: number;
  pastDue: number;
}
/** One ATS family over the last 30 days (Phase 10.1). Counts only — see FillTelemetryService. */
interface FillQuality {
  ats: string;
  fills: number;
  fillRatePct: number;
  gapRatePct: number;
  correctionRatePct: number;
  genericPct: number;
  fieldsFailed: number;
}
interface Analytics {
  totalUsers: number;
  activatedUsers: number;
  activationRatePct: number;
  signups7d: number;
  signups30d: number;
  activeUsers7d: number;
  activeUsers30d: number;
  totalResumes: number;
  totalApplications: number;
  funnel: Funnel;
  applicationsByStatus: Record<string, number>;
  billing: Billing;
  fillQuality: FillQuality[];
}

const ATS_NAMES: Record<string, string> = {
  workday: "Workday",
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workable: "Workable",
  icims: "iCIMS",
  taleo: "Taleo",
  smartrecruiters: "SmartRecruiters",
  bamboohr: "BambooHR",
  jobvite: "Jobvite",
  indeed: "Indeed",
  successfactors: "SuccessFactors",
  oracle: "Oracle",
  linkedin: "LinkedIn",
  other: "Other sites",
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default async function AdminAnalyticsPage() {
  const res = await serverApiFetch("/api/admin/analytics");
  if (!res.ok) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Analytics</h1>
        <div className="mt-4 rounded-[var(--radius)] border border-line bg-paper p-6 text-sm text-ink-soft">Couldn&apos;t load analytics.</div>
      </div>
    );
  }
  const a = (await res.json()) as Analytics;

  const funnelStages = [
    { label: "Signed up", value: a.funnel.signedUp },
    { label: "Activated", value: a.funnel.activated },
    { label: "Built a profile", value: a.funnel.withProfile },
    { label: "Started applying", value: a.funnel.startedApplying },
    { label: "Applied", value: a.funnel.applied },
  ];
  const funnelMax = Math.max(1, a.funnel.signedUp);
  const statusMax = Math.max(1, ...Object.values(a.applicationsByStatus));
  const b = a.billing;
  // Anything Pro that isn't on one of the two configured prices. Shown rather than swallowed:
  // it means MRR is understated, and the cause is config, not the data.
  const unpriced = b.activePro - b.monthlyCount - b.threeMonthCount;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Analytics</h1>
        <p className="mt-1 text-sm text-ink-soft">Acquisition, activation, and engagement across the product.</p>
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total users" value={a.totalUsers} />
        <Stat label="Activation rate" value={`${a.activationRatePct}%`} sub={`${a.activatedUsers} activated`} />
        <Stat label="Signups (7d / 30d)" value={`${a.signups7d} / ${a.signups30d}`} />
        <Stat label="Active (7d / 30d)" value={`${a.activeUsers7d} / ${a.activeUsers30d}`} sub="by session activity" />
      </div>

      <section className="mb-6 rounded-[var(--radius)] border border-line bg-paper p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Revenue</h2>
          <p className="text-xs text-ink-soft">
            {b.monthlyCount} monthly · {b.threeMonthCount} on 3-month
            {unpriced > 0 ? ` · ${unpriced} on an unrecognised price` : ""}
          </p>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="MRR" value={usd.format(b.mrr)} sub="3-month plans counted per month" />
          <Stat label="Active Pro" value={b.activePro} />
          <Stat label="New / churned (mo)" value={`${b.newThisMonth} / ${b.churnedThisMonth}`} sub="this calendar month" />
          <Stat
            label="Past due"
            value={b.pastDue}
            sub={b.pastDue > 0 ? "still Pro while Stripe retries" : "no failed payments"}
          />
        </div>
      </section>

      {/* Phase 10.1 — where the autofill lets people down, worst first. This is the list 10.4's
          adapter work is taken from, so it ranks by the failure a user actually feels: a fill that
          leaves a required field empty. */}
      <section className="mb-6 rounded-[var(--radius)] border border-line bg-paper p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Fill quality by ATS</h2>
          <p className="text-xs text-ink-soft">Last 30 days · worst first · counts only, never field values</p>
        </div>
        {(a.fillQuality ?? []).length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">No fills recorded yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-soft">
                  <th className="pb-2 pr-3 font-medium">ATS</th>
                  <th className="pb-2 pr-3 text-right font-medium">Fills</th>
                  <th className="pb-2 pr-3 text-right font-medium" title="Fills that left at least one required field empty">Left gaps</th>
                  <th className="pb-2 pr-3 text-right font-medium" title="Of the fields found, how many were filled">Filled</th>
                  <th className="pb-2 pr-3 text-right font-medium" title="Of the fields filled, how many the user changed afterwards">Corrected</th>
                  <th className="pb-2 text-right font-medium" title="Fills handled by the generic scanner — no dedicated adapter">No adapter</th>
                </tr>
              </thead>
              <tbody>
                {a.fillQuality.map((q) => (
                  <tr key={q.ats} className="border-t border-line">
                    <td className="py-2 pr-3 text-ink">{ATS_NAMES[q.ats] ?? q.ats}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink">{q.fills}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${q.gapRatePct >= 50 ? "font-semibold text-danger" : "text-ink"}`}>
                      {q.gapRatePct}%
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink">{q.fillRatePct}%</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink">{q.correctionRatePct}%</td>
                    <td className="py-2 text-right tabular-nums text-ink-soft">{q.genericPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-[var(--radius)] border border-line bg-paper p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Funnel</h2>
          <div className="mt-4 flex flex-col gap-3">
            {funnelStages.map((s) => {
              const pct = Math.round((s.value / funnelMax) * 100);
              const ofSignup = a.funnel.signedUp ? Math.round((s.value / a.funnel.signedUp) * 100) : 0;
              return (
                <div key={s.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-ink">{s.label}</span>
                    <span className="text-ink-soft">
                      {s.value} <span className="text-ink-soft/70">({ofSignup}%)</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-paper-2">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-[var(--radius)] border border-line bg-paper p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Applications by status</h2>
          <p className="mt-1 text-xs text-ink-soft">
            {a.totalApplications} applications · {a.totalResumes} resumes
          </p>
          <div className="mt-3 flex flex-col gap-2.5">
            {Object.entries(a.applicationsByStatus).map(([status, count]) => (
              <div key={status} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs uppercase tracking-wide text-ink-soft">{status}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-2">
                  <div className="h-full rounded-full bg-ink/70" style={{ width: `${Math.round((count / statusMax) * 100)}%` }} />
                </div>
                <span className="w-8 shrink-0 text-right text-sm text-ink">{count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-line bg-paper p-5">
      <div className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-soft">{sub}</div>}
    </div>
  );
}
