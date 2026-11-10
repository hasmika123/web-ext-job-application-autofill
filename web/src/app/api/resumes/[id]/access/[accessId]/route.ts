import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * PATCH /api/resumes/:id/access/:accessId - allow or stop PDF download on a live share link, body `{allowDownload}`
 * (the header bar's switch, R3.10). The link's address does not change. 404 for a revoked or foreign link. A thin proxy.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string; accessId: string }> }) {
  const { id, accessId } = await ctx.params;
  if (!RESUME_ID.test(id) || !RESUME_ID.test(accessId)) return badId();
  const body = await request.text();
  if (!body.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  return forward(`/api/profile/resumes/${id}/access/${accessId}`, { method: "PATCH", body, headers: { "content-type": "application/json" } });
}

/** DELETE /api/resumes/:id/access/:accessId - revoke a person's access or a link (idempotent, 204). */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string; accessId: string }> }) {
  const { id, accessId } = await ctx.params;
  if (!RESUME_ID.test(id) || !RESUME_ID.test(accessId)) return badId();
  return forward(`/api/profile/resumes/${id}/access/${accessId}`, { method: "DELETE" });
}
