import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * POST /api/resumes/:id/doc/checkpoint - write a version of the saved document now ("Save as version…" and the
 * Save button, R3.10 / R3.3), body `{name?}` (an empty body is an unnamed checkpoint). Spring answers
 * `{versionNo, reason, pdf}`; 422 for a name over 80 characters. A thin proxy.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  const body = (await request.text()).trim() || "{}";
  return forward(`/api/profile/resumes/${id}/doc/checkpoint`, { method: "POST", body, headers: { "content-type": "application/json" } });
}
