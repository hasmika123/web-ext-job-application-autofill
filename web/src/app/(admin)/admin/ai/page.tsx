import Link from "next/link";
import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";

export const metadata: Metadata = {
  title: "AI usage · Admin · Kiwiply",
  robots: { index: false, follow: false },
};

interface UserSpend {
  /** null = spend kept from deleted accounts. */
  login: string | null;
  calls: number;
  costMicros: number;
  percentOfProBudget: number;
}
interface TaskSpend {
  task: string;
  calls: number;
  costMicros: number;
}
interface AiUsageView {
  period: string;
  proBudgetMicros: number;
  freeParsesPerMonth: number;
  totalCostMicros: number;
  totalCalls: number;
  userCount: number;
  users: UserSpend[];
  tasks: TaskSpend[];
}

const TASK_LABELS: Record<string, string> = {
  draft: "Answer drafting",
  pick: "Option picks",
  map: "Field mapping",
  enrich: "Job enrichment",
  parse: "Resume parsing",
  match: "Resume match",
  fit: "Job fit",
  tailor: "Resume tailoring",
  jobs: "Daily job matches",
  inbox: "Inbox reading",
};

/** Dollars from millionths of a dollar. Small amounts keep 4 decimals so a $0.0024 call isn't "$0.00". */
function usd(micros: number): string {
  const d = micros / 1_000_000;
  return `$${d.toFixed(d !== 0 && Math.abs(d) < 1 ? 4 : 2)}`;
}

function shiftMonth(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Admin AI usage (Phase 9.A2.1; cost-based since 13.1c). What server AI actually cost in a UTC
 * month, from the `ai_call` ledger: the total, per user (dearest first, with each user's share of the
 * Pro budget) and per feature. This is the only place dollars appear — users see a percentage.
 */
export default async function AdminAiUsagePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const sp = await searchParams;
  const periodParam = sp.period && /^\d{4}-\d{2}$/.test(sp.period) ? `?period=${sp.period}` : "";

  const res = await serverApiFetch(`/api/admin/ai-usage${periodParam}`);
  if (!res.ok) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">AI usage</h1>
        <div className="mt-4 rounded-[var(--radius)] border border-line bg-paper p-6 text-sm text-ink-soft">
          Couldn&apos;t load AI usage.
        </div>
      </div>
    );
  }
  const data = (await res.json()) as AiUsageView;
  const avg = data.userCount > 0 ? data.totalCostMicros / data.userCount : 0;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">AI usage</h1>
          <p className="mt-1 text-sm text-ink-soft">
            What server AI cost in {data.period} (UTC), from every call&apos;s billed tokens. Pro budget:{" "}
            {usd(data.proBudgetMicros)}/user/month · Free: {data.freeParsesPerMonth} resume parses/month.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/admin/ai?period=${shiftMonth(data.period, -1)}`} className="rounded-[var(--radius)] border border-line px-3 py-1.5 font-medium text-ink hover:bg-paper-2">
            ← {shiftMonth(data.period, -1)}
          </Link>
          <Link href={`/admin/ai?period=${shiftMonth(data.period, 1)}`} className="rounded-[var(--radius)] border border-line px-3 py-1.5 font-medium text-ink hover:bg-paper-2">
            {shiftMonth(data.period, 1)} →
          </Link>
        </div>
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total cost" value={usd(data.totalCostMicros)} />
        <Stat label="Calls" value={data.totalCalls.toLocaleString()} />
        <Stat label="Users with AI" value={data.userCount.toLocaleString()} />
        <Stat label="Average per user" value={usd(avg)} />
      </div>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">By feature</h2>
      <div className="mb-8 overflow-x-auto rounded-[var(--radius)] border border-line">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-paper-2 text-left text-[12px] uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-2.5 font-semibold">Feature</th>
              <th className="px-4 py-2.5 font-semibold">Calls</th>
              <th className="px-4 py-2.5 font-semibold">Cost</th>
            </tr>
          </thead>
          <tbody>
            {data.tasks.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-ink-soft">
                  No AI calls this month.
                </td>
              </tr>
            )}
            {data.tasks.map((t) => (
              <tr key={t.task} className="border-b border-line bg-paper last:border-0">
                <td className="px-4 py-2.5 font-medium text-ink">{TASK_LABELS[t.task] ?? t.task}</td>
                <td className="px-4 py-2.5 text-ink">{t.calls.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-ink">{usd(t.costMicros)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">By user</h2>
      <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-paper-2 text-left text-[12px] uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-2.5 font-semibold">User</th>
              <th className="px-4 py-2.5 font-semibold">Calls</th>
              <th className="px-4 py-2.5 font-semibold">Cost</th>
              <th className="px-4 py-2.5 font-semibold">Of Pro budget</th>
            </tr>
          </thead>
          <tbody>
            {data.users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink-soft">
                  No AI usage this month.
                </td>
              </tr>
            )}
            {data.users.map((u) => {
              const high = u.percentOfProBudget >= 80;
              return (
                <tr key={u.login ?? "__deleted"} className="border-b border-line bg-paper last:border-0">
                  <td className="px-4 py-2.5">
                    {u.login ? (
                      <Link href={`/admin/users/${encodeURIComponent(u.login)}`} className="font-medium text-ink hover:underline">
                        {u.login}
                      </Link>
                    ) : (
                      <span className="italic text-ink-soft">Deleted accounts</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-ink">{u.calls.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-ink">{usd(u.costMicros)}</td>
                  <td className="px-4 py-2.5">
                    <span className={high ? "font-semibold text-danger" : "text-ink-soft"}>
                      {u.percentOfProBudget}%{high && " · near the cap"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-line bg-paper p-5">
      <div className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold text-ink">{value}</div>
    </div>
  );
}
