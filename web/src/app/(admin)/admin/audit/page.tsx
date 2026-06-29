import Link from "next/link";
import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";

export const metadata: Metadata = {
  title: "Audit log · Admin · Kiwiply",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 30;

interface AuditEvent {
  id: number;
  actorLogin: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  reason?: string | null;
  details?: string | null;
  createdDate?: string | null;
}

function when(iso?: string | null): string {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 19);
}

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);

  const res = await serverApiFetch(`/api/admin/audit?page=${page}&size=${PAGE_SIZE}&sort=createdDate,desc`);

  let events: AuditEvent[] = [];
  let total = 0;
  let error = false;
  if (res.ok) {
    events = ((await res.json().catch(() => [])) as AuditEvent[]) ?? [];
    total = Number.parseInt(res.headers.get("x-total-count") ?? "0", 10) || 0;
  } else {
    error = true;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Audit log</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {error ? "Couldn't load the audit log." : `${total} recorded action${total === 1 ? "" : "s"}. Immutable, newest first.`}
        </p>
      </header>

      {error ? (
        <div className="rounded-[var(--radius)] border border-line bg-paper p-6 text-sm text-ink-soft">
          The audit log couldn&apos;t be loaded. Check that the API is reachable and try again.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-paper-2 text-left text-[12px] uppercase tracking-wide text-ink-soft">
                  <th className="px-4 py-2.5 font-semibold">When</th>
                  <th className="px-4 py-2.5 font-semibold">Actor</th>
                  <th className="px-4 py-2.5 font-semibold">Action</th>
                  <th className="px-4 py-2.5 font-semibold">Target</th>
                  <th className="px-4 py-2.5 font-semibold">Reason / details</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-ink-soft">
                      No actions recorded yet.
                    </td>
                  </tr>
                )}
                {events.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0 bg-paper align-top">
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-soft">{when(e.createdDate)}</td>
                    <td className="px-4 py-2.5 font-medium text-ink">{e.actorLogin}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-semibold text-ink ring-1 ring-line">
                        {e.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-ink-soft">
                      {e.targetId ? `${e.targetType ?? ""}${e.targetType ? ":" : ""}${e.targetId}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-ink-soft">{e.reason || e.details || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
              <PageLink page={page - 1} disabled={page <= 0} label="← Newer" />
              <span className="text-ink-soft">
                Page {page + 1} of {totalPages}
              </span>
              <PageLink page={page + 1} disabled={page + 1 >= totalPages} label="Older →" />
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function PageLink({ page, disabled, label }: { page: number; disabled: boolean; label: string }) {
  if (disabled) {
    return <span className="rounded-[var(--radius)] border border-line px-3 py-1.5 text-ink-soft/50">{label}</span>;
  }
  return (
    <Link href={`/admin/audit?page=${page}`} className="rounded-[var(--radius)] border border-line px-3 py-1.5 font-medium text-ink hover:bg-paper-2">
      {label}
    </Link>
  );
}
