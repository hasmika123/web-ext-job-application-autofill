import { serverApiFetch } from "@/lib/api";

/**
 * POST /api/inbox/suggestions/:id/(accept|dismiss) — act on a job the inbox found that the board
 * doesn't track (Phase 14.4b). Accept takes optional `{ company, roleTitle }` corrections and
 * returns `{ applicationId }`.
 */
const ACTIONS = new Set(["accept", "dismiss"]);

export async function POST(request: Request, ctx: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await ctx.params;
  if (!/^\d+$/.test(id) || !ACTIONS.has(action)) {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as { company?: unknown; roleTitle?: unknown } | null;
  const forward: Record<string, string> = {};
  if (action === "accept") {
    if (typeof body?.company === "string" && body.company.trim()) forward.company = body.company.trim();
    if (typeof body?.roleTitle === "string" && body.roleTitle.trim()) forward.roleTitle = body.roleTitle.trim();
  }
  let res: Response;
  try {
    res = await serverApiFetch(`/api/profile/inbox/suggestions/${id}/${action}`, { method: "POST", body: JSON.stringify(forward) });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (res.status === 401) return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  if (res.status === 404) return Response.json({ error: "That suggestion is no longer there." }, { status: 404 });
  if (res.status === 409) return Response.json({ error: "That one was already handled." }, { status: 409 });
  if (res.status === 400) return Response.json({ error: "Give the company and the role." }, { status: 400 });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return Response.json({ error: "That didn't work. Please try again." }, { status: 502 });
  return Response.json(data);
}
