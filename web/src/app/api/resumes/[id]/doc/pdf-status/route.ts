import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * GET /api/resumes/:id/doc/pdf-status - the state of the resume's stored PDF (R3.7, DESIGN 8.5):
 * `{status: NONE|PENDING|RUNNING|READY|FAILED|STALE, hash, generatedAt, attempts, error, pollMs, pollWindowMs}`.
 * The editor polls it while the PDF is not READY; `pollMs` / `pollWindowMs` are settings handed down by
 * Spring. A thin proxy: ownership (404) and everything else is Spring's.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  return forward(`/api/profile/resumes/${id}/doc/pdf-status`);
}
