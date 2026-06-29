import Link from "next/link";
import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";

export const metadata: Metadata = {
  title: "Bug reports · Admin · Kiwiply",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 30;

interface Report {
  id: number;
  source?: string | null;
  userLogin?: string | null;
  email?: string | null;
  message: string;
  category: string;
  status: string;
  createdDate?: string | null;
}

const TABS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "NEW", label: "New" },
  { key: "TRIAGED", label: "Triaged" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "WONTFIX", label: "Won't fix" },
];

export default async function AdminBugReportsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = TABS.some((t) => t.key === sp.status) ? (sp.status ?? "") : "";
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const statusQs = status ? `status=${status}&` : "";

  const [listRes, countsRes] = await Promise.all([
    serverApiFetch(`/api/admin/bug-reports?${statusQs}page=${page}&size=${PAGE_SIZE}&sort=createdDate,desc`),
    serverApiFetch("/api/admin/bug-reports/counts"),
  ]);

  let rows: Report[] = [];
  let total = 0;
  let error = false;
  if (listRes.ok) {
    rows = ((await listRes.json().catch(() => [])) as Report[]) ?? [];
    total = Number.parseInt(listRes.headers.get("x-total-count") ?? "0", 10) || 0;
  } else {
    error = true;
  }
  const counts = countsRes.ok ? ((await countsRes.json().catch(() => ({}))) as Record<string, number>) : {};
  const allCount = Object.values(counts).reduce((a, b) => a + b, 0);
  const tabCount = (key: string) => (key === "" ? allCount : counts[key] ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Bug reports</h1>
        <p className="mt-1 text-sm text-ink-soft">Reports from the web widget and the extension. Triage by setting a status.</p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = t.key === status;
          return (
            <Link
              key={t.key || "all"}
              href={`/admin/bug-reports${t.key ? `?status=${t.key}` : ""}`}
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
        <div className="rounded-[var(--radius)] border border-line bg-paper p-6 text-sm text-ink-soft">Couldn&apos;t load reports.</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-paper-2 text-left text-[12px] uppercase tracking-wide text-ink-soft">
                  <th className="px-4 py-2.5 font-semibold">When</th>
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">From</th>
                  <th className="px-4 py-2.5 font-semibold">Message</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-ink-soft">No reports.</td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0 bg-paper hover:bg-paper-2">
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-soft">{(r.createdDate ?? "").slice(0, 10) || "—"}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{r.category}{r.source === "extension" ? " · ext" : ""}</td>
                    <td className="px-4 py-2.5"><StatusPill status={r.status} /></td>
                    <td className="px-4 py-2.5 text-ink-soft">{r.userLogin || r.email || "anon"}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/bug-reports/${r.id}`} className="text-ink hover:underline">
                        {r.message.length > 60 ? r.message.slice(0, 60) + "…" : r.message}
                      </Link>
                    </td>
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
  const map: Record<string, string> = {
    NEW: "bg-accent text-on-accent",
    TRIAGED: "bg-paper-2 text-ink-soft ring-1 ring-line",
    IN_PROGRESS: "bg-brown-soft text-brown-deep",
    RESOLVED: "bg-ink text-paper",
    WONTFIX: "bg-danger/15 text-danger",
  };
  const label = status === "IN_PROGRESS" ? "In progress" : status === "WONTFIX" ? "Won't fix" : status.charAt(0) + status.slice(1).toLowerCase();
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[status] ?? "bg-paper-2 text-ink-soft"}`}>{label}</span>;
}

function PageLink({ status, page, disabled, label }: { status: string; page: number; disabled: boolean; label: string }) {
  if (disabled) return <span className="rounded-[var(--radius)] border border-line px-3 py-1.5 text-ink-soft/50">{label}</span>;
  const qs = `${status ? `status=${status}&` : ""}page=${page}`;
  return (
    <Link href={`/admin/bug-reports?${qs}`} className="rounded-[var(--radius)] border border-line px-3 py-1.5 font-medium text-ink hover:bg-paper-2">
      {label}
    </Link>
  );
}
