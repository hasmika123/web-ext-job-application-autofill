import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import AuditPage, { type AuditEvent } from "@/components/admin-v3/audit/AuditPage";

export const metadata: Metadata = {
  title: "Audit log · Admin · Kiwiply",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 30;

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

  return <AuditPage events={events} total={total} page={page} pageSize={PAGE_SIZE} error={error} />;
}
