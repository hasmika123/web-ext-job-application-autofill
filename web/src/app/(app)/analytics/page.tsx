import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import type { Application } from "@/components/ApplicationBoard";
import AnalyticsPage from "@/components/app-v3/analytics/AnalyticsPage";
import { computeAnalytics } from "@/components/app-v3/analytics/compute";

export const metadata: Metadata = { title: "Analytics" };

/**
 * Analytics (APP-V3-SPEC 2.12). Counts, the status donut, the weekly chart and response rate by
 * company come from the real `/api/profile/applications` list; with no submitted applications the
 * board's sample numbers render. "Skills in demand" is sample.
 */
export default async function Page() {
  const res = await serverApiFetch("/api/profile/applications");
  const apps: Application[] = res.ok ? (((await res.json().catch(() => [])) as Application[]) ?? []) : [];
  return <AnalyticsPage data={computeAnalytics(apps)} />;
}
