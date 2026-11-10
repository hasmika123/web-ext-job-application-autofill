import type { Metadata } from "next";
import OpportunitiesPage from "@/components/org-v2/opportunities/OpportunitiesPage";

export const metadata: Metadata = { title: "Job Opportunities · Organization" };

export default function OrgOpportunitiesRoute() {
  return <OpportunitiesPage />;
}
