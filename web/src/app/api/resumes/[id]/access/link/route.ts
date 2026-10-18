import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * POST /api/resumes/:id/access/link - create a revocable share link, body `{expiresAt?, label?, allowDownload?}`
 * (all optional; the defaults are settings). 201 with the grant, whose `url` is the address to send; or 403
 * `FEATURE_DISABLED`, 422 `LIMIT` / `NOT_SHAREABLE` / `ACCESS_INVALID`, relayed verbatim.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  const body = (await request.text()).trim() || "{}";
  return forward(`/api/profile/resumes/${id}/access/link`, { method: "POST", body });
}
