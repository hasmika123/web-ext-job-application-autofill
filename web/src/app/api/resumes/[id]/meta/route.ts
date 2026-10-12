import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * GET / PATCH /api/resumes/:id/meta - the resume's metadata (R3.9, DESIGN 9.7): name, target, tags,
 * primary, archived, starred. PATCH takes any subset (`{name}`, `{primary: true}`, `{archived: true}`...);
 * the list's rename / set primary / archive use it. Relays the API's refusals verbatim: 409
 * `PRIMARY_REQUIRED`, 422 `META_INVALID`. A thin proxy.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  return forward(`/api/profile/resumes/${id}/meta`, { method: "GET" });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  const body = await request.text();
  if (!body.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  return forward(`/api/profile/resumes/${id}/meta`, { method: "PATCH", body, headers: { "content-type": "application/json" } });
}
