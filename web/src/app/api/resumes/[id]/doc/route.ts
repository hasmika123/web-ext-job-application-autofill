import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";
import { scoreForSave } from "@/lib/resume-score-server";

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
 * PUT /api/resumes/:id/doc — autosave, body `{doc, theme?, pages?}`. `If-Match` is forwarded
 * untouched; Spring answers 428 `IF_MATCH_REQUIRED`, 409 `DOC_VERSION_CONFLICT {serverVersion, doc}`,
 * 413 `DOC_TOO_LARGE` or 422 `DOC_INVALID {path, message}`, all relayed verbatim.
 *
 * The Resume Score is computed HERE, by the same `scoreResume` the editor runs live (DESIGN 11.1):
 * the BFF forwards `{doc, theme?, score}` and Spring stores the score without evaluating it. A `score`
 * the browser sent is dropped (never trusted); `pages` (the editor's measured page count) only feeds
 * the score and is not forwarded. If scoring is not possible the save goes through without one.
 */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  const raw = await request.text();
  if (!raw.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });

  let body = raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const { pages, score: _ignored, ...rest } = parsed as Record<string, unknown>;
      void _ignored;
      const score = await scoreForSave(id, { doc: rest.doc, theme: rest.theme, pages });
      body = JSON.stringify(score ? { ...rest, score } : rest);
    }
  } catch {
    // Not JSON: Spring's 422 explains it better than we can.
  }

  return forward(`/api/profile/resumes/${id}/doc`, {
    method: "PUT",
    body,
    ifMatch: request.headers.get("if-match"),
  });
}
