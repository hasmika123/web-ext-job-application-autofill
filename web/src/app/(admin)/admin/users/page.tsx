import Link from "next/link";
import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import UsersTable, { type AdminUser } from "@/components/admin/UsersTable";

export const metadata: Metadata = {
  title: "Users · Admin · Kiwiply",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 20;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);

  const res = await serverApiFetch(`/api/admin/users?page=${page}&size=${PAGE_SIZE}&sort=id,desc`);

  let users: AdminUser[] = [];
  let total = 0;
  let error = false;
  if (res.ok) {
    users = ((await res.json().catch(() => [])) as AdminUser[]) ?? [];
    total = Number.parseInt(res.headers.get("x-total-count") ?? "0", 10) || 0;
  } else {
    error = true;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = page > 0;
  const hasNext = page + 1 < totalPages;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Users</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {error ? "Couldn't load users." : `${total} account${total === 1 ? "" : "s"}.`}
        </p>
      </header>

      {error ? (
        <div className="rounded-[var(--radius)] border border-line bg-paper p-6 text-sm text-ink-soft">
          The user list couldn&apos;t be loaded. Check that the API is reachable and try again.
        </div>
      ) : (
        <>
          <UsersTable users={users} />

          {totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
              <PageLink page={page - 1} disabled={!hasPrev} label="← Previous" />
              <span className="text-ink-soft">
                Page {page + 1} of {totalPages}
              </span>
              <PageLink page={page + 1} disabled={!hasNext} label="Next →" />
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
    <Link
      href={`/admin/users?page=${page}`}
      className="rounded-[var(--radius)] border border-line px-3 py-1.5 font-medium text-ink hover:bg-paper-2"
    >
      {label}
    </Link>
  );
}
