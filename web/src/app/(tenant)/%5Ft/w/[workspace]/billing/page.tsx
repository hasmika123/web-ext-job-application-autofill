import type { Metadata } from "next";
import BillingPage from "@/components/ent/billing/BillingPage";
import { ComingSoon, NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { catchAllPage } from "@/lib/ent/shell";
import { can } from "@/lib/ent/workspaces";

/**
 * Billing & Invoices at `/w/admin/billing` (docs/enterprise-v2/ORG-BILLING-BUILD.md step 1a), inside the EnterpriseShell. The menu lists it for `billing.view` when the billing
 * module is on; the API is the real gate and answers the generic 404 otherwise.
 */
export const metadata: Metadata = { title: "Billing & Invoices", robots: { index: false, follow: false } };

export default async function WorkspaceBillingRoute({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (workspace !== "admin") {
    const hit = catchAllPage(me, workspace, ["billing"]);
    return hit.kind === "page" ? <ComingSoon title={hit.title} /> : <NotYourRole />;
  }
  if (!can(me, "billing.view")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return <BillingPage orgId={me.org.id} />;
}
