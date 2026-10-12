import type { Metadata } from "next";
import OrgHero from "@/components/marketing/organizations/OrgHero";
import OrgFeatures from "@/components/marketing/organizations/OrgFeatures";
import OrgHow from "@/components/marketing/organizations/OrgHow";
import OrgVisibility from "@/components/marketing/organizations/OrgVisibility";
import OrgReporting from "@/components/marketing/organizations/OrgReporting";
import OrgCtaBand from "@/components/marketing/organizations/OrgCtaBand";

export const metadata: Metadata = {
  title: "For organizations",
  description:
    "Support employee job placement at scale. Manage your team's job search, assign support, track progress, and improve outcomes with AI-powered tools, all in one place.",
};

/** /organizations (landing v2, exact-board mode, spec section 13): six blocks, all server-rendered. */
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
