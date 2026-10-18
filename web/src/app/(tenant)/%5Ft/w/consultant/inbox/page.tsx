import type { Metadata } from "next";
import ConsultantInboxPage from "@/components/ent/consultant-ws/InboxPage";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";

/**
 * Consultant Inbox at `/w/consultant/inbox`, inside the EnterpriseShell (the sibling layout draws the frame): the consultant's OWN Gmail, connected the
 * same guided way as on kiwiply.com. The API is the gate (404 for anyone who is not a consultant of this organization, 402 FEATURE_NOT_LICENSED when
 * the license lacks inbox tracking); the organization never sees the mailbox (docs/enterprise-v2/18-consultant-inbox.md).
 */
export const metadata: Metadata = { title: "Inbox", robots: { index: false, follow: false } };

export default async function ConsultantInboxRoute() {
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (!me.workspaces.some((w) => w.key === "consultant")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return <ConsultantInboxPage orgId={me.org.id} firstName={me.person.name} />;
}
