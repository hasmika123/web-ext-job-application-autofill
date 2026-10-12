import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * GET /api/resumes/:id/meta - the resume's metadata (name, target, tags, primary, lifecycle, role, lineage,
 * `visibility`, `recruiterSharing`, version, PDF state), for built and uploaded resumes alike (R3.9, R3.11).
 * A thin proxy: ownership (404) and everything else is Spring's.
 * The list's rename / set primary / archive use PATCH (R2.6).
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  return forward(`/api/profile/resumes/${id}/meta`);
}

/**
 * PATCH /api/resumes/:id/meta - change any of `{name, target, tags, primary, starred, archived, shareWithOrg}`
 * plus the two sharing switches of R3.11: `{visibility: "PRIVATE"}` (revoke every person grant and leave the
 * org) and `{recruiterSharing: true|false}` (create the default share link / revoke every link). Spring's
 * problem bodies (`META_INVALID`, `PRIMARY_REQUIRED`, `FEATURE_DISABLED`, `LIMIT`, ...) are relayed verbatim.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  const body = await request.text();
  if (!body.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  return forward(`/api/profile/resumes/${id}/meta`, { method: "PATCH", body, headers: { "content-type": "application/json" } });
}
