import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * POST /api/resumes/:id/doc/import - "Open in builder" on an uploaded resume (R2.6): its parsed structure
 * becomes a document and the same resume becomes a built one. 200 `{resume, doc}`, 409 `ALREADY_BUILT`
 * when it already is. A thin proxy.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  return forward(`/api/profile/resumes/${id}/doc/import`, { method: "POST" });
}
