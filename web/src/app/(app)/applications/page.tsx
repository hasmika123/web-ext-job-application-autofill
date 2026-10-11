import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import type { Application } from "@/components/ApplicationBoard";
import ApplicationsV3Page from "@/components/app-v3/applications/ApplicationsV3Page";
import { mapApplications } from "@/components/app-v2/applications/mapping";

export const metadata: Metadata = { title: "My Applications" };

/**
 * My Applications (app v3, spec 2.3). The real `/api/profile/applications` list is mapped onto the
 * table by the v2 mapper; with no applications yet the page renders the board's sample rows.
 */
export default async function Page() {
  const res = await serverApiFetch("/api/profile/applications");
  const apps: Application[] = res.ok ? (((await res.json().catch(() => [])) as Application[]) ?? []) : [];
  return <ApplicationsV3Page rows={mapApplications(apps)} />;
}
