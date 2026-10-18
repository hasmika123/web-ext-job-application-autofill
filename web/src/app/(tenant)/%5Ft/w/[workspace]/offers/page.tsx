import type { Metadata } from "next";
import { Suspense } from "react";
import OffersPage from "@/components/ent/accounts-offers/OffersPage";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { can } from "@/lib/ent/workspaces";

/**
 * Offers at `/w/{workspace}/offers`, inside the EnterpriseShell: the workspace layout draws the frame, this page takes the organization and the member from
 * the tenant session and renders the page. The menu lists it for `offers.manage`; a member who types the URL without that key gets "This isn't part of your
 * role" (the API answers 404 to every call regardless). The consultant's own Offers page is a different route (`/w/consultant/offers`).
 */
export const metadata: Metadata = { title: "Offers", robots: { index: false, follow: false } };

export default async function WorkspaceOffersRoute({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (!can(me, "offers.manage")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  void workspace;
  return (
    <Suspense fallback={null}>
      <OffersPage orgId={me.org.id} orgName={me.org.displayName} permissions={me.permissions} />
    </Suspense>
  );
}
