import Link from "next/link";
import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";

export const metadata: Metadata = {
  title: "Email · Admin · Kiwiply",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 30;

interface Subscriber {
  id: number;
  email: string;
  status: string;
  consentSource?: string | null;
  consentAt?: string | null;
  confirmedAt?: string | null;
  createdDate?: string | null;
}

const TABS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "PENDING", label: "Pending" },
  { key: "UNSUBSCRIBED", label: "Unsubscribed" },
];

export default async function AdminSubscribersPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = TABS.some((t) => t.key === sp.status) ? (sp.status ?? "") : "";
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const statusQs = status ? `status=${status}&` : "";

  const [listRes, countsRes] = await Promise.all([
    serverApiFetch(`/api/admin/subscribers?${statusQs}page=${page}&size=${PAGE_SIZE}&sort=createdDate,desc`),
    serverApiFetch("/api/admin/subscribers/counts"),
  ]);

  let rows: Subscriber[] = [];
  let total = 0;
  let error = false;
  if (listRes.ok) {
    rows = ((await listRes.json().catch(() => [])) as Subscriber[]) ?? [];
    total = Number.parseInt(listRes.headers.get("x-total-count") ?? "0", 10) || 0;
  } else {
    error = true;
  }
  const counts = countsRes.ok ? ((await countsRes.json().catch(() => ({}))) as Record<string, number>) : {};
  const allCount = (counts.CONFIRMED ?? 0) + (counts.PENDING ?? 0) + (counts.UNSUBSCRIBED ?? 0);
  const tabCount = (key: string) => (key === "" ? allCount : counts[key] ?? 0);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Email subscribers</h1>
          <p className="mt-1 text-sm text-ink-soft">Double opt-in newsletter list — the source of truth for marketing consent.</p>
        </div>
        <a
          href={`/api/admin/subscribers/export${status ? `?status=${status}` : ""}`}
          className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-paper-2"
        >
          Download CSV
        </a>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = t.key === status;
          return (
            <Link
              key={t.key || "all"}
              href={`/admin/subscribers${t.key ? `?status=${t.key}` : ""}`}
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
        <div className="rounded-[var(--radius)] border border-line bg-paper p-6 text-sm text-ink-soft">Couldn&apos;t load subscribers.</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-paper-2 text-left text-[12px] uppercase tracking-wide text-ink-soft">
                  <th className="px-4 py-2.5 font-semibold">Email</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Source</th>
                  <th className="px-4 py-2.5 font-semibold">Subscribed</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-ink-soft">No subscribers.</td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0 bg-paper">
                    <td className="px-4 py-2.5 text-ink">{r.email}</td>
                    <td className="px-4 py-2.5"><StatusPill status={r.status} /></td>
                    <td className="px-4 py-2.5 text-ink-soft">{r.consentSource || "—"}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{(r.confirmedAt || r.consentAt || r.createdDate || "").slice(0, 10) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
              <PageLink status={status} page={page - 1} disabled={page <= 0} label="← Previous" />
              <span className="text-ink-soft">Page {page + 1} of {totalPages}</span>
              <PageLink status={status} page={page + 1} disabled={page + 1 >= totalPages} label="Next →" />
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "CONFIRMED") return <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-on-accent">Confirmed</span>;
  if (status === "UNSUBSCRIBED") return <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger">Unsubscribed</span>;
  return <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-semibold text-ink-soft ring-1 ring-line">Pending</span>;
}

function PageLink({ status, page, disabled, label }: { status: string; page: number; disabled: boolean; label: string }) {
  if (disabled) return <span className="rounded-[var(--radius)] border border-line px-3 py-1.5 text-ink-soft/50">{label}</span>;
  const qs = `${status ? `status=${status}&` : ""}page=${page}`;
  return (
    <Link href={`/admin/subscribers?${qs}`} className="rounded-[var(--radius)] border border-line px-3 py-1.5 font-medium text-ink hover:bg-paper-2">
      {label}
    </Link>
  );
}
