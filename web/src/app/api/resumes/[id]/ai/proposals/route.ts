import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * GET /api/resumes/:id/ai/proposals - the resume's open AI proposals (no AI call), each marked `stale` when the
 * document has changed since (R4.1). A thin proxy.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  return forward(`/api/profile/resumes/${id}/ai/proposals`);
}
