import type { ReactNode } from "react";
import HomePage from "./home/HomePage";
import TeamPage from "./team/TeamPage";
import AssignmentsPage from "./assignments/AssignmentsPage";
import PipelineBoardPage from "./pipeline/PipelineBoardPage";
import ApprovalsPage from "./approvals/ApprovalsPage";
import WorkloadPage from "./workload/WorkloadPage";
import EscalationsPage from "./escalations/EscalationsPage";
import ReportsPage from "@/components/ent/reports/ReportsPage";
import type { MgmtPageProps } from "./parts";
import { firstNameOf } from "@/lib/ent/dashboard";
import type { MeTenant } from "@/lib/ent/workspaces";

/** Real Marketing Manager pages, keyed by the path below `/w/marketing-mgmt`. */
export function mgmtPage(slug: string[], props: MgmtPageProps): ReactNode | null {
  if (slug.length === 0) return <HomePage {...props} />;
  if (slug.length === 1 && slug[0] === "home") return <HomePage {...props} />;
  if (slug.length !== 1) return null;
  switch (slug[0]) {
    case "team":
      return <TeamPage {...props} />;
    case "assignments":
      return <AssignmentsPage {...props} />;
    case "pipeline":
      return <PipelineBoardPage {...props} />;
    case "approvals":
      return <ApprovalsPage {...props} />;
    case "workload":
      return <WorkloadPage {...props} />;
    case "escalations":
      return <EscalationsPage {...props} />;
    case "reports":
      return <ReportsPage orgId={props.orgId} orgName={props.orgName} scope="team" basePath={`/api/orgs/${props.orgId}/mgmt/reports/overview`} />;
    default:
      return null;
  }
}

/** Build the one shared prop seam from the tenant session. Pages never read session cookies themselves. */
export function mgmtPageFor(me: MeTenant, slug: string[], initialSearch?: Record<string, string | string[] | undefined>): ReactNode | null {
  if (!me.org.id) return null;
  const nav = me.workspaces.find((workspace) => workspace.key === "marketing-mgmt")?.nav ?? [];
  const hrefs: Record<string, string | null> = Object.fromEntries(nav.map((item) => [item.key, item.href]));
  return mgmtPage(slug, { orgId: me.org.id, orgName: me.org.displayName, firstName: firstNameOf(me.person.name), hrefs, initialSearch });
}
