import { redirect } from "next/navigation";
import EnterpriseShell from "@/components/ent/shell/EnterpriseShell";
import { NoWorkspacePanel, NotMemberPanel, NotYourRole, PausedPanel, UnavailablePanel } from "@/components/ent/shell/ShellStates";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { shellWorkspace } from "@/lib/ent/shell";
import { getTenant } from "@/lib/tenant";

/**
 * The workspace layout (16 s2.4): `/w/[workspace]/...` on a tenant host.
 *   1. the host must be a served tenant (the tenant layout above already answered 404 / unavailable otherwise);
 *   2. `GET /api/me/tenant`: signed out (or another tenant's token) -> the sign-in; MEMBER_SUSPENDED -> the paused panel
 *      (sign-out only, no organization data); not a member -> its panel; unreachable -> "try again", never an empty menu;
 *   3. a workspace the member's roles do not grant renders the "This isn't part of your role" state INSIDE the shell (no redirect);
 *   4. otherwise the EnterpriseShell around the page.
 * Pages are server components that call their own BFF; the API is the gate for every one of them.
 */
export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  const t = await getTenant();
  if (t.kind !== "TENANT") return null;
  const session = await getTenantSession();
  if (session.kind === "UNAUTHENTICATED") redirect("/login");
  if (session.kind === "SUSPENDED") return <PausedPanel />;
  if (session.kind === "NOT_A_MEMBER") return <NotMemberPanel orgName={t.tenant.displayName} />;
  if (session.kind === "UNAVAILABLE") return <UnavailablePanel />;

  const chosen = shellWorkspace(session.me, workspace);
  if (!chosen) return <NoWorkspacePanel />;
  const other = session.me.workspaces.find((w) => w.home === session.me.landing) ?? session.me.workspaces[0];
  return (
    <EnterpriseShell
      me={session.me}
      etag={session.etag}
      workspace={chosen.ws}
      tenant={{ displayName: t.tenant.displayName, logoUrl: t.tenant.branding?.logoUrl ?? null, supportEmail: t.tenant.branding?.supportEmail ?? null }}
    >
      {chosen.allowed ? children : <NotYourRole switchTo={other ? { label: other.label, href: other.home } : null} />}
    </EnterpriseShell>
  );
}
