import { forward } from "@/lib/resume-doc-proxy";
import { ORG_ID } from "@/lib/org-types";

/**
 * GET /api/orgs/:orgId/overview - the dashboard numbers: seat counts, application progress of the members who share (counts
 * only), and the org's recent activity for roles that may read the audit trail. Needs `reports.view`.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  if (!ORG_ID.test(orgId)) return Response.json({ error: "Not found" }, { status: 404 });
  return forward(`/api/orgs/${orgId}/overview`);
}
