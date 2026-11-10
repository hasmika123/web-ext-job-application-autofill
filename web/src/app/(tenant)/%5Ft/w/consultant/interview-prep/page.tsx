import { redirect } from "next/navigation";

/**
 * `/w/consultant/interview-prep` (Interview Prep) became the Prepare tab of Interviews in the UI refresh (Phase 1,
 * docs/enterprise-v2/ui-refresh/PHASE1-STRUCTURE-AND-CONTENT.md s6): the old address keeps working and opens that tab.
 */
export default function ConsultantInterviewPrepRedirect(): never {
  redirect("/w/consultant/interviews?tab=prepare");
}
