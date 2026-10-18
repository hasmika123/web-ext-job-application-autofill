import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import type { Customer } from "@/lib/customers";
import CustomersPage from "@/components/admin-v3/customers/CustomersPage";

export const metadata: Metadata = {
  title: "Customers · Admin",
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
 * Everyone who has ever paid (Phase 9.C1): status, renewal, total paid, and a link into Stripe for
 * anything involving money. Manage opens the billing timeline and notes on the user's page.
 * A second unfiltered fetch (newest 100) feeds the board's Renewals / Onboarding / Churn panels.
 */
export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<{ filter?: string; page?: string }> }) {
  const sp = await searchParams;
  const filter = TABS.some((t) => t.key === sp.filter) ? (sp.filter ?? "") : "";
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const filterQs = filter ? `filter=${filter}&` : "";

  const [listRes, countsRes, recentRes] = await Promise.all([
    serverApiFetch(`/api/admin/customers?${filterQs}page=${page}&size=${PAGE_SIZE}`),
    serverApiFetch("/api/admin/customers/counts"),
    serverApiFetch("/api/admin/customers?page=0&size=100"),
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
  const recent = recentRes.ok ? (((await recentRes.json().catch(() => [])) as Customer[]) ?? []) : [];

  return (
    <CustomersPage
      rows={rows}
      total={total}
      page={page}
      pageSize={PAGE_SIZE}
      filter={filter}
      tabs={TABS.map((t) => ({ ...t, count: tabCount(t.key) }))}
      counts={counts}
      recent={recent}
      error={error}
    />
  );
}
