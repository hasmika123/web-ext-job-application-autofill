import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * POST /api/resumes/:id/doc/sync-master/apply - merge the chosen master changes into this tailored resume, body
 * `{ids: [...]}` (DESIGN 9.11). Spring answers the merged document with its new `ETag` (passed through) and moves
 * the "copied from" marker to the master's current state. A thin proxy.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  const body = await request.text();
  if (!body.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  return forward(`/api/profile/resumes/${id}/doc/sync-master/apply`, { method: "POST", body, headers: { "content-type": "application/json" } });
}
