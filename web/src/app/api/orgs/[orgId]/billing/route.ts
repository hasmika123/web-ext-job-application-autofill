import { forward } from "@/lib/resume-doc-proxy";
import { ORG_ID } from "@/lib/org-types";

/**
 * GET /api/orgs/:orgId/billing - `{status, billingEnabled, devActivation, subscription, items, invoices}`: the skeleton of
 * the org's money until org billing ships (E2E-O4.0). Needs `billing.view`; anyone else gets Spring's generic 404.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  if (!ORG_ID.test(orgId)) return Response.json({ error: "Not found" }, { status: 404 });
  return forward(`/api/orgs/${orgId}/billing`);
}
