import { forward } from "@/lib/resume-doc-proxy";
import { ORG_ID } from "@/lib/org-types";

/**
 * POST /api/orgs/:orgId/activate - DRAFT to ACTIVE without paying (E2E-O4.0). Spring answers the generic 404 unless the caller
 * is the owner AND the environment allows it (dev / CI / demo with billing off; production never does), so this route never decides.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  if (!ORG_ID.test(orgId)) return Response.json({ error: "Not found" }, { status: 404 });
  return forward(`/api/orgs/${orgId}/activate`, { method: "POST" });
}
