import { redirect } from "next/navigation";

/**
 * `/w/{workspace}/departments` (Departments) became the Departments tab of Teams & Departments in the UI refresh (Phase 1,
 * docs/enterprise-v2/ui-refresh/PHASE1-STRUCTURE-AND-CONTENT.md s4): the old address keeps working and opens that tab.
 */
export default async function WorkspaceDepartmentsRedirect({ params }: { params: Promise<{ workspace: string }> }): Promise<never> {
  const { workspace } = await params;
  redirect(`/w/${encodeURIComponent(workspace)}/teams?tab=departments`);
}
