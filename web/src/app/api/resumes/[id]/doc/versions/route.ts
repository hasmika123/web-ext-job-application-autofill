import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * GET /api/resumes/:id/doc/versions - the version history, newest first (R3.9, DESIGN 9.11): `{versionNo, reason,
 * name, createdAt, contentHash, by, kind}` per row. Feeds the header's Version menu and the All versions sheet. A thin proxy.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  return forward(`/api/profile/resumes/${id}/doc/versions`);
}
