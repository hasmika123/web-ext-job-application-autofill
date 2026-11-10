import type { Metadata } from "next";
import AnalyticsPage from "@/components/app-v3/analytics/AnalyticsPage";

export const metadata: Metadata = { title: "Analytics" };

/**
 * Analytics (APP-E2E U12.1). Everything is fetched in the browser from `GET /api/analytics` so the weeks are the
 * user's own (their time zone) and the period select refetches without a page load. No sample data anywhere: a
 * brand-new account sees an honest empty state, a seeded demo account sees what the server seeded for it.
 */
export default function Page() {
  return <AnalyticsPage />;
}
