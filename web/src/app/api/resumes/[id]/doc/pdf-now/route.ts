import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * POST /api/resumes/:id/doc/pdf-now - generate the PDF without waiting for the settle delay (R3.7): the
 * editor calls it when the user leaves (after flushing the save) and for "Retry" after a failed PDF.
 * 204 whether or not anything was queued (a current PDF needs nothing). A thin proxy.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  return forward(`/api/profile/resumes/${id}/doc/pdf-now`, { method: "POST" });
}
