import { serverApiFetch } from "@/lib/api";

/**
 * POST /api/applications/:id/job-fit — one resume against this application's job (Phase 13.3,
 * Pro): match %, what it covers, what it's missing, red flags. Proxies Spring's
 * `/api/profile/applications/:id/job-fit`; `{ resumeId }` is optional (default: the linked resume).
 *
 * The click that sends this is the user's consent — the Resume fit section's caption says what is
 * sent and to whom — so it is forwarded as `consent: true`.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return Response.json({ error: "Invalid application id." }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as { resumeId?: unknown } | null;
  const resumeId = body?.resumeId;
  if (resumeId !== undefined && resumeId !== null && !(typeof resumeId === "number" && Number.isInteger(resumeId) && resumeId > 0)) {
    return Response.json({ error: "Invalid resume id." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await serverApiFetch(`/api/profile/applications/${id}/job-fit`, {
      method: "POST",
      body: JSON.stringify({ resumeId: resumeId ?? null, consent: true }),
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }

  if (res.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }
  if (res.status === 402) {
    return Response.json({ error: "The job-fit check is part of Pro.", proRequired: true }, { status: 402 });
  }
  if (res.status === 404) {
    return Response.json({ error: "That application or resume is no longer there." }, { status: 404 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return Response.json({ error: "Couldn't check the fit right now. Please try again." }, { status: 502 });
  }
  return Response.json(data);
}
