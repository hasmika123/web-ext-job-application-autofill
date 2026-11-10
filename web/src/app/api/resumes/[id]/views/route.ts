import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/** GET /api/resumes/:id/views?limit=50 - who viewed this resume, newest first (R3.11). Owner views are not recorded. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  const limit = new URL(request.url).searchParams.get("limit");
  const qs = limit && /^\d{1,3}$/.test(limit) ? `?limit=${limit}` : "";
  return forward(`/api/profile/resumes/${id}/views${qs}`);
}
