import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import type { AdminUser } from "@/components/admin/UsersTable";
import UsersPage from "@/components/admin-v3/users/UsersPage";

export const metadata: Metadata = {
  title: "Users · Admin · Kiwiply",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 20;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);

  const [res, kpiRes] = await Promise.all([
    serverApiFetch(`/api/admin/users?page=${page}&size=${PAGE_SIZE}&sort=id,desc`),
    serverApiFetch("/api/admin/analytics"),
  ]);

  let users: AdminUser[] = [];
  let total = 0;
  let error = false;
  if (res.ok) {
    users = ((await res.json().catch(() => [])) as AdminUser[]) ?? [];
    total = Number.parseInt(res.headers.get("x-total-count") ?? "0", 10) || 0;
  } else {
    error = true;
  }

  let active7d: number | undefined;
  if (kpiRes.ok) {
    const k = (await kpiRes.json().catch(() => null)) as { activeUsers7d?: number } | null;
    active7d = k?.activeUsers7d;
  }

  return (
    <UsersPage users={users} total={total} page={page} pageSize={PAGE_SIZE} error={error} active7d={active7d} initialQuery={sp.q ?? ""} />
  );
}
