import type { Metadata } from "next";
import DashboardPage from "@/components/ent/dashboard/DashboardPage";
import MarketingHomePage from "@/components/ent/marketer-ws/MarketingHomePage";
import { ComingSoon, NotYourRole } from "@/components/ent/shell/ShellStates";
import { firstNameOf } from "@/lib/ent/dashboard";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { catchAllPage } from "@/lib/ent/shell";
import { can } from "@/lib/ent/workspaces";

/**
 * Every menu page that has no page of its own yet (X2.16): the sidebar must never lead to a 404. A page the member's menu lists
 * renders "This page is on the way" (with the bee); a path their menu does not list is "This isn't part of your role" (the API
 * is the real gate, this only avoids showing a page that is not theirs). Real pages are plain sibling folders and win over this.
 *
 * The Admin workspace's own home (`/w/admin`, no slug) is the Organization Dashboard (X2.17): it needs `dashboard.view_org`
 * (the API answers the same gate), and an Admin member without it keeps the "on the way" home.
 */
/** The tab title is the org's, never Kiwiply's: an absolute "{page} · {org}" (the layout's title template would not apply to this segment's fallback). */
export async function generateMetadata({ params }: { params: Promise<{ workspace: string; slug?: string[] }> }): Promise<Metadata> {
  const { workspace, slug } = await params;
  const session = await getTenantSession();
  const robots = { index: false, follow: false };
  if (session.kind !== "OK") return { robots };
  const hit = catchAllPage(session.me, workspace, slug ?? []);
  const page = workspace === "admin" && (slug ?? []).length === 0 ? "Dashboard" : hit.kind === "page" ? hit.title : null;
  const org = session.me.org.displayName;
  return { title: { absolute: page ? `${page} · ${org}` : org }, robots };
}

export default async function WorkspaceCatchAll({ params }: { params: Promise<{ workspace: string; slug?: string[] }> }) {
  const { workspace, slug } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the layout already showed the matching panel
  const { me } = session;
  const hit = catchAllPage(me, workspace, slug ?? []);
  if (hit.kind === "page" && workspace === "admin" && (slug ?? []).length === 0 && can(me, "dashboard.view_org") && me.org.id) {
    const nav = me.workspaces.find((w) => w.key === "admin")?.nav ?? [];
    const hrefOf = (key: string) => nav.find((n) => n.key === key)?.href ?? null;
    return (
      <DashboardPage
        orgId={me.org.id}
        orgName={me.org.displayName}
        firstName={firstNameOf(me.person.name)}
        auditHref={hrefOf("audit")}
        employeesHref={hrefOf("employees")}
        invitationsHref={hrefOf("invitations")}
      />
    );
  }
  if (hit.kind === "page" && workspace === "marketing" && (slug ?? []).length === 0 && can(me, "consultants.view") && me.org.id) {
    // Marketing Home (marketer workspace): the board for a Marketing Specialist's assigned consultants.
    const nav = me.workspaces.find((w) => w.key === "marketing")?.nav ?? [];
    const hrefs = Object.fromEntries(nav.map((n) => [n.key, n.href]));
    return <MarketingHomePage orgId={me.org.id} orgName={me.org.displayName} firstName={firstNameOf(me.person.name)} hrefs={hrefs} />;
  }
  if (hit.kind === "page") return <ComingSoon title={hit.title} />;
  const other = me.workspaces.find((w) => w.home === me.landing) ?? me.workspaces[0];
  return <NotYourRole switchTo={other ? { label: other.label, href: other.home } : null} />;
}
