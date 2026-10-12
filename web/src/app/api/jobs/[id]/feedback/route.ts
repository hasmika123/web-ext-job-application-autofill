import { badId, forwardJson, ID } from "@/lib/tracker-proxy";

/**
 * POST /api/jobs/:id/feedback - `{signal: "HIDE" | "HIDE_COMPANY"}` -> 201 `{signal, archivedApplicationId}`. The job (or
 * every job of that company) stops showing in the user's search; hiding a saved job archives its application, and the
 * id comes back so the page can offer Undo.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID.test(id)) return badId("job");
  return forwardJson(request, `/api/jobs/${id}/feedback`, "POST");
}
