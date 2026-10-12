import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * POST /api/resumes/:id/doc/duplicate - a copy of a resume (the list's duplicate button; an alias of
 * `source: copy` on `/api/resumes/built`, R2.6). Optional body `{label}`. 201 `{resume, doc}`, or 402
 * `RESUME_LIMIT` (the plan's cap, relayed verbatim). A thin proxy.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  const body = (await request.text()).trim() || "{}";
  return forward(`/api/profile/resumes/${id}/doc/duplicate`, { method: "POST", body, headers: { "content-type": "application/json" } });
}
