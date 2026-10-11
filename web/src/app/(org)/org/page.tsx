import type { Metadata } from "next";
import DashboardPage from "@/components/org-v2/dashboard/DashboardPage";

export const metadata: Metadata = { title: "Dashboard · Organization" };

export default function OrgDashboardRoute() {
  return <DashboardPage />;
}
