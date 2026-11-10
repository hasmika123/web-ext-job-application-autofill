import type { Metadata } from "next";
import AlertsPage from "@/components/app-v3/alerts/AlertsPage";

export const metadata: Metadata = { title: "Job Alerts" };

export default function Page() {
  return <AlertsPage />;
}
