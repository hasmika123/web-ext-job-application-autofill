import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * PATCH /api/resumes/:id/doc/theme — Customize Template (accent, font, spacing, page length), body
 * `{theme}`. Needs no `If-Match` (it never touches the typed content) but bumps the version: the
 * response's `ETag` is what the editor must send next. A thin proxy; Spring bounds the fields.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  const body = await request.text();
  if (!body.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  return forward(`/api/profile/resumes/${id}/doc/theme`, { method: "PATCH", body });
}
