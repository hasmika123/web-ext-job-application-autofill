import Link from "next/link";
import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import { billingLabel, money, periodLabel, STATUS_LABEL, STATUS_PILL, type Customer } from "@/lib/customers";

export const metadata: Metadata = {
  title: "Customers · Admin · Kiwiply",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 30;

const TABS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "PAST_DUE", label: "Payment failed" },
  { key: "CANCELLING", label: "Cancelling" },
  { key: "LAPSED", label: "Lapsed" },
  { key: "NEW", label: "New this month" },
];

/**
 * Everyone who has ever paid (Phase 9.C1): plan, status, renewal, total paid, and a link into
 * Stripe for anything involving money. Click a name for the billing timeline and notes.
 */
export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<{ filter?: string; page?: string }> }) {
  const sp = await searchParams;
  const filter = TABS.some((t) => t.key === sp.filter) ? (sp.filter ?? "") : "";
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const filterQs = filter ? `filter=${filter}&` : "";

  const [listRes, countsRes] = await Promise.all([
    serverApiFetch(`/api/admin/customers?${filterQs}page=${page}&size=${PAGE_SIZE}`),
    serverApiFetch("/api/admin/customers/counts"),
  ]);

  let rows: Customer[] = [];
  let total = 0;
  let error = false;
  if (listRes.ok) {
    rows = ((await listRes.json().catch(() => [])) as Customer[]) ?? [];
    total = Number.parseInt(listRes.headers.get("x-total-count") ?? "0", 10) || 0;
  } else {
    error = true;
  }
  const counts = countsRes.ok ? ((await countsRes.json().catch(() => ({}))) as Record<string, number>) : {};
  const tabCount = (key: string) => counts[key === "" ? "ALL" : key] ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Customers</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Everyone who has ever subscribed. Refunds and disputes happen in Stripe — open a customer there from their row.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = t.key === filter;
          return (
            <Link
              key={t.key || "all"}
              href={`/admin/customers${t.key ? `?filter=${t.key}` : ""}`}
              className={
                active
                  ? "rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-paper"
                  : "rounded-full border border-line px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-paper-2"
              }
            >
              {t.label} <span className={active ? "text-paper/70" : "text-ink-soft/70"}>({tabCount(t.key)})</span>
            </Link>
          );
        })}
      </div>

      {error ? (
        <div className="rounded-[var(--radius)] border border-line bg-paper p-6 text-sm text-ink-soft">Couldn&apos;t load customers.</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-paper-2 text-left text-[12px] uppercase tracking-wide text-ink-soft">
                  <th className="px-4 py-2.5 font-semibold">Customer</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Billing</th>
                  <th className="px-4 py-2.5 font-semibold">Period</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Total paid</th>
                  <th className="px-4 py-2.5 font-semibold">Stripe</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-ink-soft">
                      No customers here yet.
                    </td>
                  </tr>
                )}
                {rows.map((c) => (
                  <tr key={c.login} className="border-b border-line bg-paper last:border-0 hover:bg-paper-2">
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/users/${encodeURIComponent(c.login)}#billing`} className="font-medium text-ink hover:underline">
                        {c.name || c.login}
                      </Link>
                      <div className="text-[12px] text-ink-soft">{c.email || c.login}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span title={c.stripeStatus ?? undefined} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_PILL[c.statusGroup]}`}>
                        {STATUS_LABEL[c.statusGroup]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-ink-soft">{billingLabel(c.billing)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-soft">{periodLabel(c)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-ink">{money(c.totalPaidCents, c.currency)}</td>
                    <td className="px-4 py-2.5">
                      {c.stripeUrl ? (
                        <a href={c.stripeUrl} target="_blank" rel="noreferrer" className="text-accent-deep hover:underline">
                          Open ↗
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
              <PageLink filter={filter} page={page - 1} disabled={page <= 0} label="← Previous" />
              <span className="text-ink-soft">
                Page {page + 1} of {totalPages}
              </span>
              <PageLink filter={filter} page={page + 1} disabled={page + 1 >= totalPages} label="Next →" />
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function PageLink({ filter, page, disabled, label }: { filter: string; page: number; disabled: boolean; label: string }) {
  if (disabled) return <span className="rounded-[var(--radius)] border border-line px-3 py-1.5 text-ink-soft/50">{label}</span>;
  const qs = `${filter ? `filter=${filter}&` : ""}page=${page}`;
  return (
    <Link href={`/admin/customers?${qs}`} className="rounded-[var(--radius)] border border-line px-3 py-1.5 font-medium text-ink hover:bg-paper-2">
      {label}
    </Link>
  );
}
