import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * POST /api/resumes/:id/doc/checkpoint {name?} - the editor's Save / Save as version (R3.3, DESIGN 10.15): writes a
 * MANUAL (or NAMED) version of the saved document and asks for its PDF at once. The editor flushes its autosave
 * first. A thin proxy: Spring's answer ({versionNo, reason, pdf}) and error bodies pass through unchanged.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name : undefined;
  return forward(`/api/profile/resumes/${id}/doc/checkpoint`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(name === undefined ? {} : { name }),
  });
}
