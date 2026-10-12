import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * POST /api/resumes/:id/doc/versions/:n/restore - make an earlier version the current document (R3.10). Spring
 * writes the current content as its own version first, then answers the restored document with its new `ETag`
 * (passed through), which the editor adopts as the version its next save sends. A thin proxy.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await ctx.params;
  if (!RESUME_ID.test(id) || !RESUME_ID.test(n)) return badId();
  return forward(`/api/profile/resumes/${id}/doc/versions/${n}/restore`, { method: "POST" });
}
