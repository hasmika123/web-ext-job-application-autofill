import { badId, forward, ID } from "@/lib/tracker-proxy";

/** POST /api/jobs/:id/save - put the posting on the board as a SAVED application -> `{applicationId}`. */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID.test(id)) return badId("job");
  return forward(`/api/jobs/${id}/save`, { method: "POST" });
}
