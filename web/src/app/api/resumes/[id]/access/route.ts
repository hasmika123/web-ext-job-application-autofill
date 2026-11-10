import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * GET /api/resumes/:id/access - who can see this resume (R3.11): `{org, grants, links, viewers}`. `org` is null
 * when the organisation area is not in play. A thin proxy; a resume that is not the caller's is a 404.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  return forward(`/api/profile/resumes/${id}/access`);
}

/**
 * POST /api/resumes/:id/access - share with a Kiwiply account, body `{email, role?, expiresAt?, label?}`.
 * Spring answers 201 with the grant, or 404 `USER_NOT_FOUND`, 409 `ALREADY_GRANTED`, 422 `ROLE_NOT_AVAILABLE` /
 * `LIMIT` / `NOT_SHAREABLE` / `ACCESS_INVALID` / `SENSITIVE_CONTENT`, all relayed verbatim.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  const body = await request.text();
  if (!body.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  return forward(`/api/profile/resumes/${id}/access`, { method: "POST", body });
}
