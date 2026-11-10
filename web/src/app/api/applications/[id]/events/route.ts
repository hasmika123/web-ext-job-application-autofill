import { badId, forward, ID, search } from "@/lib/tracker-proxy";

/**
 * GET /api/applications/:id/events - the full history of one application, newest first, paged
 * (`?page=&size=`; Spring clamps the size). Each row names who did it and what changed. 404 when it is not the caller's.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID.test(id)) return badId();
  return forward(`/api/profile/applications/${id}/events${search(request)}`);
}
