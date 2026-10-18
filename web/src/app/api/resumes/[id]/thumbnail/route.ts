import { serverApiFetch } from "@/lib/api";
import { RESUME_ID, badId } from "@/lib/resume-doc-proxy";

/**
 * GET /api/resumes/:id/thumbnail - the card thumbnail of a built resume (R3.13): the PNG the PDF job took of the first
 * page. A thin proxy of the owner-scoped Spring endpoint that keeps its `ETag` (the render hash) and
 * `Cache-Control: private, max-age=86400`, and passes `If-None-Match` through, so a browser revalidates for free (304).
 * The list asks for `?v=<thumbHash>`, so a new render is a new address; Spring ignores the parameter. 404 = none yet.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();

  const headers: Record<string, string> = {};
  const inm = request.headers.get("if-none-match");
  if (inm) headers["if-none-match"] = inm;

  let res: Response;
  try {
    res = await serverApiFetch(`/api/profile/resumes/${id}/thumbnail`, { headers });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (res.status !== 200 && res.status !== 304) return new Response(null, { status: res.status });
  const out = new Headers();
  for (const name of ["content-type", "etag", "cache-control"]) {
    const v = res.headers.get(name);
    if (v) out.set(name, v);
  }
  return new Response(res.status === 304 ? null : res.body, { status: res.status, headers: out });
}
