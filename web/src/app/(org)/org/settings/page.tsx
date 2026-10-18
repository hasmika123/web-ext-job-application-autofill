import type { Metadata } from "next";
import SettingsPage from "@/components/org-v2/settings/SettingsPage";

export const metadata: Metadata = { title: "Settings · Organization" };

export default function OrgSettingsRoute() {
  return <SettingsPage />;
}
