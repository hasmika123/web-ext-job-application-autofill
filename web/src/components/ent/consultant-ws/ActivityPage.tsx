"use client";

import { useSearchParams } from "next/navigation";
import ActivityTimelinePage from "./ActivityTimelinePage";
import ConsultantNotificationsPage from "./NotificationsPage";

/**
 * Consultant Activity (UI refresh Phase 1, s6): "Needs attention" (the notifications list) and "Timeline" (the activity timeline), chosen by
 * `?tab=attention|timeline` so the old Notifications and Activity Timeline addresses redirect straight to their tab.
 */
export default function ConsultantActivityPage({ orgId, firstName }: { orgId: number; firstName: string }) {
  const tab = useSearchParams()?.get("tab") === "timeline" ? "timeline" : "attention";
  return tab === "timeline" ? <ActivityTimelinePage orgId={orgId} firstName={firstName} /> : <ConsultantNotificationsPage orgId={orgId} firstName={firstName} />;
}
