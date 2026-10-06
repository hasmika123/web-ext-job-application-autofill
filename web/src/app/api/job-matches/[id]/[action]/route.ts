import { serverApiFetch } from "@/lib/api";

/**
 * POST /api/job-matches/:id/(save|dismiss) — act on one daily job match (Phase 13.6c). Save puts it
 * on the board as a SAVED application, built by the server from the stored posting (the browser sends
 * nothing but the id), and returns `{ applicationId }`; dismiss hides it for good.
 */
const ACTIONS = new Set(["save", "dismiss"]);

export async function POST(_request: Request, ctx: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await ctx.params;
  if (!/^\d+$/.test(id) || !ACTIONS.has(action)) {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }
  let res: Response;
  try {
    res = await serverApiFetch(`/api/profile/job-matches/${id}/${action}`, { method: "POST" });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (res.status === 401) return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  if (res.status === 404) return Response.json({ error: "That match is no longer there." }, { status: 404 });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return Response.json({ error: "That didn't work. Please try again." }, { status: 502 });
  return Response.json(data);
}
