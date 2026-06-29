import Link from "next/link";
import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";

export const metadata: Metadata = {
  title: "AI usage · Admin · Kiwiply",
  robots: { index: false, follow: false },
};

interface UserUsage {
  login: string;
  draftCount: number;
}
interface AiUsageView {
  period: string;
  defaultQuota: number;
  totalDrafts: number;
  userCount: number;
  users: UserUsage[];
}

function shiftMonth(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

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

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">AI usage</h1>
          <p className="mt-1 text-sm text-ink-soft">Server-side drafting meter for {data.period}.</p>
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

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Total drafts" value={data.totalDrafts.toLocaleString()} />
        <Stat label="Active users" value={data.userCount.toLocaleString()} />
        <Stat label="Free quota / user" value={`${data.defaultQuota}/mo`} />
      </div>

      <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-paper-2 text-left text-[12px] uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-2.5 font-semibold">User</th>
              <th className="px-4 py-2.5 font-semibold">Drafts</th>
              <th className="px-4 py-2.5 font-semibold">vs quota</th>
            </tr>
          </thead>
          <tbody>
            {data.users.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-ink-soft">
                  No AI usage this month.
                </td>
              </tr>
            )}
            {data.users.map((u) => {
              const over = u.draftCount >= data.defaultQuota;
              return (
                <tr key={u.login} className="border-b border-line last:border-0 bg-paper">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/users/${encodeURIComponent(u.login)}`} className="font-medium text-ink hover:underline">
                      {u.login}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-ink">{u.draftCount}</td>
                  <td className="px-4 py-2.5">
                    <span className={over ? "font-semibold text-danger" : "text-ink-soft"}>
                      {u.draftCount} / {data.defaultQuota}
                      {over && " · over"}
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
