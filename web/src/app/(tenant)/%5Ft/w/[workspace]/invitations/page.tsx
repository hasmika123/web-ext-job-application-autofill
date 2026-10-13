import type { Metadata } from "next";
import InvitationsPage from "@/components/ent/invitations/InvitationsPage";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { can } from "@/lib/ent/workspaces";
import { getTenant } from "@/lib/tenant";

/**
 * Invitations at `/w/{workspace}/invitations`, mounted inside the EnterpriseShell: the workspace layout draws the frame, this page
 * takes the organization and the permission from the tenant session (`GET /api/me/tenant`). Every call the page makes (list,
 * counters, activity, invite, resend, revoke) needs `members.invite` at the API, so a member without it gets "This isn't part of
 * your role" here; the API refuses the calls regardless.
 */
export const metadata: Metadata = { title: "Invitations", robots: { index: false, follow: false } };

export default async function WorkspaceInvitationsRoute() {
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (!can(me, "members.invite")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  const t = await getTenant();
  const supportEmail = t.kind === "TENANT" ? (t.tenant.branding?.supportEmail ?? null) : null;
  return <InvitationsPage orgId={me.org.id} orgName={me.org.displayName} supportEmail={supportEmail} canInvite />;
}
