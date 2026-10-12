import { badInput, forwardJson, NUM } from "@/lib/org-proxy";

/**
 * PUT /api/me/orgs/:orgId/share - the member changes what they share with one org, body
 * `{scope: NONE|SUMMARY|FULL, consentVersion, fullToMemberId?}`. Takes effect on the next request. Spring answers 422
 * for FULL without a valid named person or an unknown consent version, and 404 unless the caller is an active member.
 */
export async function PUT(request: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  if (!NUM.test(orgId)) return badInput("organization id");
  return forwardJson(request, `/api/me/orgs/${orgId}/share`, "PUT");
}
