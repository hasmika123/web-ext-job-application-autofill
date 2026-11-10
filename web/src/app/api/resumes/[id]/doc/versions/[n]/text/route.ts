import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * GET /api/resumes/:id/doc/versions/:n/text - one version as ATS plain text, for Compare (R3.10). `text/plain`.
 * A thin proxy; 404 when there is no such version.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await ctx.params;
  if (!RESUME_ID.test(id) || !RESUME_ID.test(n)) return badId();
  return forward(`/api/profile/resumes/${id}/doc/versions/${n}/text`);
}
