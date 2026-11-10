import { redirect } from "next/navigation";

/**
 * `/w/consultant/features` (My Features) became the Plan & features tab of Settings in the UI refresh (Phase 1,
 * docs/enterprise-v2/ui-refresh/PHASE1-STRUCTURE-AND-CONTENT.md s6): the old address keeps working and opens that tab.
 */
export default function ConsultantFeaturesRedirect(): never {
  redirect("/w/consultant/settings?tab=features");
}
