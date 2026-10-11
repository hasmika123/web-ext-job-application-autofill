import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import EmailPage, { type Subscriber } from "@/components/admin-v3/email/EmailPage";
import { SUBSCRIBER_STATUS_TABS } from "@/components/admin-v3/email/constants";

export const metadata: Metadata = {
  title: "Email · Admin · Kiwiply",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 30;

/** Email (board 15). The route stays /admin/subscribers: it is the real subscriber list + CSV export. */
export default async function AdminSubscribersPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = SUBSCRIBER_STATUS_TABS.some((t) => t.key === sp.status) ? (sp.status ?? "") : "";
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

  return (
    <EmailPage
      rows={rows}
      total={total}
      page={page}
      pageSize={PAGE_SIZE}
      status={status}
      counts={counts}
      error={error}
      initialTab={sp.status !== undefined || sp.page !== undefined ? "subscribers" : "campaigns"}
    />
  );
}
