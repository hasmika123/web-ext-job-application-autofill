import type { Metadata } from "next";
import ApplicationsPage from "@/components/org-v2/applications/ApplicationsPage";

export const metadata: Metadata = { title: "Applications (Organization)" };

export default function OrgApplicationsRoute() {
  return <ApplicationsPage />;
}
