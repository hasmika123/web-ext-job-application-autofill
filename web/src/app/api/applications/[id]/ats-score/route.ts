import { serverApiFetch } from "@/lib/api";

/**
 * POST /api/applications/:id/ats-score `{ resumeId }` — a resume's ATS score against this
 * application's job (Phase 13.5, Pro): the structure checks plus how many of the job's key terms it
 * covers. Proxies Spring's `/api/profile/applications/:id/ats-score`.
 *
 * Keyword coverage comes from the job-fit report, which the board has already fetched (and the
 * server cached) by the time this is asked — so it costs no further AI. The click that opened the
 * report was the user's consent, as for the job-fit route, so `consent: true` is forwarded.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return Response.json({ error: "Invalid application id." }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as { resumeId?: unknown } | null;
  const resumeId = body?.resumeId;
  if (!(typeof resumeId === "number" && Number.isInteger(resumeId) && resumeId > 0)) {
    return Response.json({ error: "Invalid resume id." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await serverApiFetch(`/api/profile/applications/${id}/ats-score`, {
      method: "POST",
      body: JSON.stringify({ resumeId, consent: true }),
    });
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
    return Response.json({ error: "That application or resume is no longer there." }, { status: 404 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return Response.json({ error: "Couldn't score this resume right now. Please try again." }, { status: 502 });
  }
  return Response.json(data);
}
