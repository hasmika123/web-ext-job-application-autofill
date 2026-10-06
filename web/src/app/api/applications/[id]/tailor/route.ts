import { serverApiFetch } from "@/lib/api";

/**
 * POST /api/applications/:id/tailor — a checked proposal to tailor one resume to this application's
 * job (Phase 13.4, Pro). Proxies Spring's `/api/profile/applications/:id/tailor` with `{ resumeId }`.
 * Opening the tailoring dialog is the user's consent (its description says what is sent), so it is
 * forwarded as `consent: true`.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { resumeId?: unknown } | null;
  const resumeId = body?.resumeId;
  if (!/^\d+$/.test(id) || typeof resumeId !== "number" || !Number.isInteger(resumeId) || resumeId <= 0) {
    return Response.json({ error: "Choose a resume to tailor." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await serverApiFetch(`/api/profile/applications/${id}/tailor`, {
      method: "POST",
      body: JSON.stringify({ resumeId, consent: true }),
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (res.status === 401) return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  if (res.status === 402) return Response.json({ error: "Tailoring a resume is part of Pro.", proRequired: true }, { status: 402 });
  if (res.status === 404) return Response.json({ error: "That application or resume is no longer there." }, { status: 404 });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return Response.json({ error: "Couldn't tailor the resume right now. Please try again." }, { status: 502 });
  return Response.json(data);
}
