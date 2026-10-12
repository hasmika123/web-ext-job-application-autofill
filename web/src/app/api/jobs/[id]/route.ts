import { badId, forward, ID } from "@/lib/tracker-proxy";

/** GET /api/jobs/:id - one posting in full (404 unknown, 410 `JOB_GONE` when the user tracked it and it was purged). */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID.test(id)) return badId("job");
  return forward(`/api/jobs/${id}`);
}
