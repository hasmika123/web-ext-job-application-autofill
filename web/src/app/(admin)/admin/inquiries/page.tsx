import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import InquiriesPage, { type Inquiry } from "@/components/admin-v3/inquiries/InquiriesPage";
import { INQUIRY_STATUS_TABS } from "@/components/admin-v3/inquiries/constants";

export const metadata: Metadata = {
  title: "Inquiries · Admin · Kiwiply",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 30;

/** "Contact us" requests from /pricing and /contact (Phase 15.6), on the admin v3 Inquiries board. */
export default async function AdminInquiriesPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = INQUIRY_STATUS_TABS.some((t) => t.key === sp.status) ? (sp.status ?? "") : "";
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const statusQs = status ? `status=${status}&` : "";

  const [listRes, countsRes] = await Promise.all([
    serverApiFetch(`/api/admin/inquiries?${statusQs}page=${page}&size=${PAGE_SIZE}&sort=createdDate,desc`),
    serverApiFetch("/api/admin/inquiries/counts"),
  ]);

  let rows: Inquiry[] = [];
  let total = 0;
  let error = false;
  if (listRes.ok) {
    rows = ((await listRes.json().catch(() => [])) as Inquiry[]) ?? [];
    total = Number.parseInt(listRes.headers.get("x-total-count") ?? "0", 10) || 0;
  } else {
    error = true;
  }
  const counts = countsRes.ok ? ((await countsRes.json().catch(() => ({}))) as Record<string, number>) : {};

  return <InquiriesPage rows={rows} total={total} page={page} pageSize={PAGE_SIZE} status={status} counts={counts} error={error} />;
}
