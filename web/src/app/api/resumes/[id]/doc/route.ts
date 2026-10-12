import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * GET /api/resumes/:id/doc — the builder document. Spring's `ETag: "<docVersion>"` is passed
 * through; the editor sends it back as `If-Match` on every save.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  return forward(`/api/profile/resumes/${id}/doc`);
}

/**
 * PUT /api/resumes/:id/doc — autosave, body `{doc, theme?}`. `If-Match` is forwarded untouched;
 * Spring answers 428 `IF_MATCH_REQUIRED`, 409 `DOC_VERSION_CONFLICT {serverVersion, doc}`,
 * 413 `DOC_TOO_LARGE` or 422 `DOC_INVALID {path, message}`, all relayed verbatim.
 */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  const body = await request.text();
  if (!body.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  return forward(`/api/profile/resumes/${id}/doc`, {
    method: "PUT",
    body,
    ifMatch: request.headers.get("if-match"),
  });
}
