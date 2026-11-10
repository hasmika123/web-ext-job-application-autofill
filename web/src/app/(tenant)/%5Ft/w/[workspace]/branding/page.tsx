import type { Metadata } from "next";
import BrandingPage from "@/components/ent/branding/BrandingPage";
import PageHeader from "@/components/ent/shell/ShellContext";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { can } from "@/lib/ent/workspaces";

/**
 * Organization Branding (X2.18) at `/w/{workspace}/branding`, mounted inside the EnterpriseShell (X2.16): the workspace layout
 * draws the frame (sidebar, top bar, session states), this page takes the organization and the permission from the tenant
 * session (`GET /api/me/tenant`) and renders the editor. The menu lists "Organization Branding" only for `branding.manage`;
 * a member who types the URL anyway gets "This isn't part of your role" (the API refuses the calls regardless).
 */
export const metadata: Metadata = { title: "Branding", robots: { index: false, follow: false } };

export default async function WorkspaceBrandingRoute() {
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (!can(me, "branding.manage")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return (
    <>
      <PageHeader title="Branding" subtitle="Make the portal yours before anyone sees it." />
      <BrandingPage orgId={me.org.id} orgName={me.org.displayName} />
    </>
  );
}
