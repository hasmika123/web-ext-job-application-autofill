import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import type { Application } from "@/components/ApplicationBoard";
import ApplicationsPage from "@/components/app-v2/applications/ApplicationsPage";
import { activityFrom, mapApplications } from "@/components/app-v2/applications/mapping";

export const metadata: Metadata = { title: "My Applications" };

/**
 * My Applications (board app-my-applications). The real `/api/profile/applications` list is
 * mapped onto the board's table; with no applications yet the page renders the board's sample
 * rows. The old `ApplicationBoard` component stays importable but is not rendered here.
 */
export default async function Page() {
  const res = await serverApiFetch("/api/profile/applications");
  const apps: Application[] = res.ok ? (((await res.json().catch(() => [])) as Application[]) ?? []) : [];
  return <ApplicationsPage rows={mapApplications(apps)} activity={activityFrom(apps)} />;
}
