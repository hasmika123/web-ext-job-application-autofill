import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * GET /api/resumes/shared/:id/doc - a resume shared with me, read-only (R3.11). Spring answers 404 to anyone
 * who may not read it (a stranger and a missing resume look the same) and writes the view event.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  return forward(`/api/profile/resumes/shared/${id}/doc`);
}
