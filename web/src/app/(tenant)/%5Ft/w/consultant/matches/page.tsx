import { redirect } from "next/navigation";

/**
 * `/w/consultant/matches` (Job Matches) became the Matches tab of Opportunities in the UI refresh (Phase 1,
 * docs/enterprise-v2/ui-refresh/PHASE1-STRUCTURE-AND-CONTENT.md s6): the old address keeps working and opens that tab.
 */
export default function ConsultantMatchesRedirect(): never {
  redirect("/w/consultant/opportunities?tab=matches");
}
