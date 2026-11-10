import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * GET /api/resumes/:id/lineage - the resume's master-to-tailored family (R3.9, DESIGN 9.11): the master, its tailored
 * children (with `masterChanged`) and this resume's own role. Feeds the header bar's type menu. A thin proxy.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  return forward(`/api/profile/resumes/${id}/lineage`);
}
