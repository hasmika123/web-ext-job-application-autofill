import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import type { Application } from "@/lib/applications";
import AnalyticsPage from "@/components/app-v3/analytics/AnalyticsPage";
import { computeAnalytics } from "@/components/app-v3/analytics/compute";
import { samples } from "@/components/app-v3/samples";
import { samplesEnabled } from "@/lib/samples";

export const metadata: Metadata = { title: "Analytics" };

/**
 * Analytics (APP-V3-SPEC 2.12). Counts, the status donut, the weekly chart and response rate by
 * company come from the real `/api/profile/applications` list; with no submitted applications a real account
 * sees an empty state (a demo account on a sample-enabled build sees the board's numbers, `samples()`, U0.5).
 */
export default async function Page() {
  const res = await serverApiFetch("/api/profile/applications");
  const apps: Application[] = res.ok ? (((await res.json().catch(() => [])) as Application[]) ?? []) : [];
  const accountRes = await serverApiFetch("/api/account");
  const account = accountRes.ok ? ((await accountRes.json().catch(() => null)) as { login?: string } | null) : null;
  return <AnalyticsPage data={computeAnalytics(apps, undefined, samples("AN_SAMPLE", samplesEnabled(account?.login)))} />;
}
