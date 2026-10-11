import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import AnalyticsPage, { type Analytics } from "@/components/admin-v3/analytics/AnalyticsPage";

export const metadata: Metadata = {
  title: "Analytics · Admin · Kiwiply",
  robots: { index: false, follow: false },
};

/** Acquisition, activation, revenue and fill quality. Presentation: admin-v3/analytics/AnalyticsPage (board 14). */
export default async function AdminAnalyticsPage() {
  const res = await serverApiFetch("/api/admin/analytics");
  const a = res.ok ? ((await res.json()) as Analytics) : null;
  return <AnalyticsPage a={a} />;
}
