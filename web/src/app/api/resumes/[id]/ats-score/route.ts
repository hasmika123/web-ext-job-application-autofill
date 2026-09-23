import { serverApiFetch } from "@/lib/api";

/**
 * GET /api/resumes/:id/ats-score — the resume's ATS score (Phase 13.5, Pro): fifteen structure
 * checks, what to fix first. No AI is involved. Proxies Spring's `/api/profile/resumes/:id/ats-score`.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return Response.json({ error: "Invalid resume id." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await serverApiFetch(`/api/profile/resumes/${id}/ats-score`);
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }

  if (res.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }
  if (res.status === 402) {
    return Response.json({ error: "The ATS score is part of Pro.", proRequired: true }, { status: 402 });
  }
  if (res.status === 404) {
    return Response.json({ error: "That resume is no longer there." }, { status: 404 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return Response.json({ error: "Couldn't score this resume right now. Please try again." }, { status: 502 });
  }
  return Response.json(data);
}
