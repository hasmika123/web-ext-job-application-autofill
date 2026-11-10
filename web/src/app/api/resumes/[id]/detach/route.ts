import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * POST /api/resumes/:id/detach - turn a tailored resume into a master ("Make this a master", R3.10): it keeps its
 * content and job, and stops following its master. 409 `NOT_TAILORED` for a resume that is not tailored. A thin proxy.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  return forward(`/api/profile/resumes/${id}/detach`, { method: "POST" });
}
