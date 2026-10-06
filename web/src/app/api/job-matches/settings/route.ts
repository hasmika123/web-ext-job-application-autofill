import { serverApiFetch } from "@/lib/api";

/**
 * PUT /api/job-matches/settings `{ enabled }` — switch daily job matches on or off (Phase 13.6b/c).
 * Proxies Spring's `/api/profile/job-matches/settings`. On is Pro-only and is the user's consent to
 * the nightly send the page describes; switching on matches them straight away.
 */
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return Response.json({ error: "Say whether matches are on or off." }, { status: 400 });
  }
  let res: Response;
  try {
    res = await serverApiFetch("/api/profile/job-matches/settings", { method: "PUT", body: JSON.stringify({ enabled: body.enabled }) });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (res.status === 401) return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  if (res.status === 402) return Response.json({ error: "Daily job matches are part of Pro.", proRequired: true }, { status: 402 });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return Response.json({ error: "Couldn't change that right now. Please try again." }, { status: 502 });
  return Response.json(data);
}
