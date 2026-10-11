import type { Metadata } from "next";
import TeamPage from "@/components/org-v2/team/TeamPage";

export const metadata: Metadata = { title: "Team Management (Organization)" };

export default function OrgTeamRoute() {
  return <TeamPage />;
}
