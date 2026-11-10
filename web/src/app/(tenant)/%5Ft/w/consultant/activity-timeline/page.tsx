import { redirect } from "next/navigation";

/**
 * `/w/consultant/activity-timeline` (Activity Timeline) became the Timeline tab of Activity in the UI refresh (Phase 1,
 * docs/enterprise-v2/ui-refresh/PHASE1-STRUCTURE-AND-CONTENT.md s6): the old address keeps working and opens that tab.
 */
export default function ConsultantActivityTimelineRedirect(): never {
  redirect("/w/consultant/activity?tab=timeline");
}
