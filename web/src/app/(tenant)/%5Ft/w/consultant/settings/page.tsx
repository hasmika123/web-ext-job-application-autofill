import type { Metadata } from "next";
import ConsultantSettingsPage from "@/components/ent/consultant-ws/SettingsPage";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { can } from "@/lib/ent/workspaces";

/**
 * Consultant Settings at `/w/consultant/settings` (design/enterprise-consultant/settings.webp): Privacy, Appearance and (with `features.view`) Plan & features as `?tab=` tabs, inside the EnterpriseShell (the sibling
 * layout draws the frame). The API is the gate (404 for anyone who is not a consultant of this organization).
 */
export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };

export default async function ConsultantSettingsRoute() {
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (!me.workspaces.some((w) => w.key === "consultant")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return <ConsultantSettingsPage orgId={me.org.id} firstName={me.person.name} canViewFeatures={can(me, "features.view")} />;
}
