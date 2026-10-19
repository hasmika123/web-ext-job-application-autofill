import { redirect } from "next/navigation";

/**
 * `/w/consultant/job-discovery` (Job Discovery) became the Browse tab of Opportunities in the UI refresh (Phase 1,
 * docs/enterprise-v2/ui-refresh/PHASE1-STRUCTURE-AND-CONTENT.md s6): the old address keeps working and opens that tab.
 */
export default function ConsultantJobDiscoveryRedirect(): never {
  redirect("/w/consultant/opportunities?tab=browse");
}
