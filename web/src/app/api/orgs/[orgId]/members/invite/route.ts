import { badInput, forwardJson, NUM } from "@/lib/org-proxy";

/**
 * POST /api/orgs/:orgId/members/invite - invite people by email, body `{emails: string[], role?, groupId?,
 * supportOwnerMemberId?}` (O2.2). Spring answers `{batchId, invited[], invalid[], alreadyMember[]}`; 409 SEAT_STATE while
 * the org is not active, 422 ORG_LIMIT_REACHED over a configured cap, 404 for an org the caller may not invite for.
 */
export async function POST(request: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  if (!NUM.test(orgId)) return badInput("organization id");
  return forwardJson(request, `/api/orgs/${orgId}/members/invite`, "POST");
}
