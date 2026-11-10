import type { Metadata } from "next";
import { Suspense } from "react";
import PlacementsPage from "@/components/ent/placements/PlacementsPage";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { can } from "@/lib/ent/workspaces";

/**
 * Placements at `/w/{workspace}/placements`, inside the EnterpriseShell: the workspace layout draws the frame, this page takes the
 * organization and the member from the tenant session and renders the board. The menu lists it for `placements.view` or `placements.manage`;
 * the API applies the same gate and the scope the key is held at (a member who types the URL without it gets "This isn't part of your role",
 * and the API answers 404 to every call regardless).
 */
export const metadata: Metadata = { title: "Placements", robots: { index: false, follow: false } };

export default async function WorkspacePlacementsRoute({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  const ws = me.workspaces.find((w) => w.key === workspace);
  const listed = !!ws && ws.nav.some((n) => n.href.split("?")[0] === `/w/${workspace}/placements`);
  if (!listed && !can(me, "placements.view") && !can(me, "placements.manage")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  const hrefOf = (key: string) => ws?.nav.find((n) => n.key === key)?.href ?? null;
  return (
    <Suspense fallback={null}>
      <PlacementsPage
        orgId={me.org.id}
        workspace={workspace}
        permissions={me.permissions}
        consultantsHref={hrefOf("consultants")}
        clientsHref={hrefOf("clients")}
      />
    </Suspense>
  );
}
