import { badInput, forward, NUM } from "@/lib/org-proxy";

/** POST /api/me/orgs/:orgId/leave - the caller leaves; all sharing with that org ends. 409 for an owner (transfer first). */
export async function POST(_request: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  if (!NUM.test(orgId)) return badInput("organization id");
  return forward(`/api/me/orgs/${orgId}/leave`, { method: "POST" });
}
