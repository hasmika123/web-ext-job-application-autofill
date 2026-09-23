import { serverApiFetch } from "@/lib/api";

/**
 * POST /api/applications/:id/resume-fit — which of my resumes fits this application's job best?
 * (Phase 13.2, Pro.) Proxies Spring's `/api/profile/applications/:id/resume-match`, which scores
 * every live resume against the saved job description in one AI call and caches the answer.
 *
 * Clicking "Check which resume fits" is the user's consent to send this job description and their
 * resumes to the AI provider (the button's caption says so), so it is forwarded as `consent: true`.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return Response.json({ error: "Invalid application id." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await serverApiFetch(`/api/profile/applications/${id}/resume-match`, {
      method: "POST",
      body: JSON.stringify({ consent: true }),
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }

  if (res.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }
  if (res.status === 402) {
    return Response.json({ error: "Seeing which resume fits a job is part of Pro.", proRequired: true }, { status: 402 });
  }
  if (res.status === 404) {
    return Response.json({ error: "That application is no longer there." }, { status: 404 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return Response.json({ error: "Couldn't score your resumes right now. Please try again." }, { status: 502 });
  }
  return Response.json(data);
}
