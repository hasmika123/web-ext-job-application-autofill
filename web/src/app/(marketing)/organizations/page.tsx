import type { Metadata } from "next";
import OrgHero from "@/components/marketing/organizations/OrgHero";
import OrgFeatures from "@/components/marketing/organizations/OrgFeatures";
import OrgHow from "@/components/marketing/organizations/OrgHow";
import OrgVisibility from "@/components/marketing/organizations/OrgVisibility";
import OrgReporting from "@/components/marketing/organizations/OrgReporting";
import OrgCtaBand from "@/components/marketing/organizations/OrgCtaBand";

export const metadata: Metadata = {
  title: "Kiwiply for organizations",
  description:
    "Support your people's job search at scale. Consultancies and teams manage every consultant's search, track progress and prepare applications that each person reviews and submits.",
};

/** /organizations (landing v2, spec section 9): six blocks, all server-rendered. */
export default function OrganizationsPage() {
  return (
    <main>
      <OrgHero />
      <OrgFeatures />
      <OrgHow />
      <OrgVisibility />
      <OrgReporting />
      <OrgCtaBand />
    </main>
  );
}
