import { badInput, forward, NUM } from "@/lib/org-proxy";

/** POST /api/orgs/:orgId/members/:memberId/resend - rotate a pending invite's link and email the new one (O2.2). */
export async function POST(_request: Request, ctx: { params: Promise<{ orgId: string; memberId: string }> }) {
  const { orgId, memberId } = await ctx.params;
  if (!NUM.test(orgId) || !NUM.test(memberId)) return badInput("id");
  return forward(`/api/orgs/${orgId}/members/${memberId}/resend`, { method: "POST" });
}
