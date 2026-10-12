import { forward } from "@/lib/resume-doc-proxy";
import { ORG_ID } from "@/lib/org-types";

/** GET /api/orgs/:orgId/onboarding - the activation checklist, computed by Spring (needs `org.settings.manage`; anyone else gets the generic 404). */
export async function GET(_request: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  if (!ORG_ID.test(orgId)) return Response.json({ error: "Not found" }, { status: 404 });
  return forward(`/api/orgs/${orgId}/onboarding`);
}
