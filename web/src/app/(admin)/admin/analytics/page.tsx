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
}

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
