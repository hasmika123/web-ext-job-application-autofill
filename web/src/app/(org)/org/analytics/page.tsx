import type { Metadata } from "next";
import AnalyticsPage from "@/components/org-v2/analytics/AnalyticsPage";

export const metadata: Metadata = { title: "Analytics & Reports · Organization" };

export default function OrgAnalyticsRoute() {
  return <AnalyticsPage />;
}
