import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import OverviewPage, { type OverviewKpis } from "@/components/admin-v3/overview/OverviewPage";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminOverviewPage() {
  let kpis: OverviewKpis | null = null;
  const res = await serverApiFetch("/api/admin/analytics");
  if (res.ok) {
    kpis = (await res.json().catch(() => null)) as OverviewKpis | null;
  }
  return <OverviewPage kpis={kpis} />;
}
