import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/** DELETE /api/resumes/:id/access/:accessId - revoke a person's access or a link (idempotent, 204). */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string; accessId: string }> }) {
  const { id, accessId } = await ctx.params;
  if (!RESUME_ID.test(id) || !RESUME_ID.test(accessId)) return badId();
  return forward(`/api/profile/resumes/${id}/access/${accessId}`, { method: "DELETE" });
}
