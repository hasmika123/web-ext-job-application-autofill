import { serverApiFetch } from "@/lib/api";

/**
 * POST /api/tailor/:proposalId/apply — save the kept changes of a tailoring proposal as a NEW resume
 * (Phase 13.4). Only refs travel — `{ keep: ["e0b1", "summary", "skills"], label, applicationId }` —
 * never text: Spring rebuilds the resume from the proposal it already checked, and refuses (409) if
 * the source resume changed since.
 */
const REF = /^(e\d{1,2}b\d{1,2}|summary|skills)$/;

export async function POST(request: Request, ctx: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = await ctx.params;
  if (!/^\d+$/.test(proposalId)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { keep?: unknown; label?: unknown; applicationId?: unknown } | null;
  const keep = Array.isArray(body?.keep) ? body.keep.filter((r): r is string => typeof r === "string" && REF.test(r)).slice(0, 60) : [];
  if (!keep.length) return Response.json({ error: "Keep at least one change." }, { status: 400 });
  const label = typeof body?.label === "string" ? body.label.slice(0, 200) : undefined;
  const applicationId = typeof body?.applicationId === "number" && Number.isInteger(body.applicationId) ? body.applicationId : undefined;

  let res: Response;
  try {
    res = await serverApiFetch(`/api/profile/tailor/${proposalId}/apply`, {
      method: "POST",
      body: JSON.stringify({ keep, label, applicationId }),
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (res.status === 401) return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  if (res.status === 402) {
    return Response.json({ error: "You're at the free plan's resume limit — archive one or upgrade to Pro." }, { status: 402 });
  }
  if (res.status === 409) return Response.json({ error: "That resume changed since this was made — tailor it again." }, { status: 409 });
  if (res.status === 404) return Response.json({ error: "This proposal is no longer there — tailor it again." }, { status: 404 });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return Response.json({ error: "Couldn't save the new resume." }, { status: res.status === 400 ? 400 : 502 });
  return Response.json(data, { status: 201 });
}
