import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import BugReportsPage, { type BugReport } from "@/components/admin-v3/bug-reports/BugReportsPage";
import { BUG_STATUS_TABS } from "@/components/admin-v3/bug-reports/constants";

export const metadata: Metadata = {
  title: "Bug reports · Admin · Kiwiply",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 30;

export default async function AdminBugReportsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = BUG_STATUS_TABS.some((t) => t.key === sp.status) ? (sp.status ?? "") : "";
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const statusQs = status ? `status=${status}&` : "";

  const [listRes, countsRes] = await Promise.all([
    serverApiFetch(`/api/admin/bug-reports?${statusQs}page=${page}&size=${PAGE_SIZE}&sort=createdDate,desc`),
    serverApiFetch("/api/admin/bug-reports/counts"),
  ]);

  let rows: BugReport[] = [];
  let total = 0;
  let error = false;
  if (listRes.ok) {
    rows = ((await listRes.json().catch(() => [])) as BugReport[]) ?? [];
    total = Number.parseInt(listRes.headers.get("x-total-count") ?? "0", 10) || 0;
  } else {
    error = true;
  }
  const counts = countsRes.ok ? ((await countsRes.json().catch(() => ({}))) as Record<string, number>) : {};

  return <BugReportsPage rows={rows} total={total} page={page} pageSize={PAGE_SIZE} status={status} counts={counts} error={error} />;
}
