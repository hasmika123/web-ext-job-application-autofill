"use client";

import PageHeader from "@/components/ent/shell/ShellContext";
import ActivityTimelinePage from "./ActivityTimelinePage";
import ConsultantNotificationsPage from "./NotificationsPage";
import { PageTabs, useUrlTab } from "./tabs";

const TABS = ["attention", "timeline"] as const;
const TAB_LABELS = [
  { value: "attention", label: "Needs attention" },
  { value: "timeline", label: "Timeline" },
] as const;

/**
 * Consultant Activity (UI refresh Phase 1, s6): "Needs attention" (the notifications list) and "Timeline" (the activity timeline) as two tabs of one
 * page, chosen by `?tab=attention|timeline` (attention is the default and leaves the address bare), so the old Notifications and Activity Timeline
 * addresses redirect straight to their tab.
 */
export default function ConsultantActivityPage({ orgId }: { orgId: number; firstName?: string }) {
  const [tab, setTab] = useUrlTab(TABS, "attention");
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="Activity" subtitle="What happened, and what's waiting on you." />
      <PageTabs label="Activity views" tabs={TAB_LABELS} value={tab} onChange={setTab} />
      {tab === "timeline" ? <ActivityTimelinePage orgId={orgId} /> : <ConsultantNotificationsPage orgId={orgId} />}
    </div>
  );
}
