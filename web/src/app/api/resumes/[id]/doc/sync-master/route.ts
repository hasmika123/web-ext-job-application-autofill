import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * POST /api/resumes/:id/doc/sync-master - what changed on the master since this tailored resume was copied
 * (DESIGN 9.11): `{changes: [{id, kind: added|changed|removed, section, before, after}]}`; 409 `NOT_TAILORED`.
 * Feeds the "Pull changes from master" sheet (R3.10). A thin proxy.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  return forward(`/api/profile/resumes/${id}/doc/sync-master`, { method: "POST" });
}
