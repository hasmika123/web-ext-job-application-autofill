import { serverApiFetch } from "@/lib/api";

/**
 * POST /api/suggestions/:id/accept | /api/suggestions/:id/dismiss — the user's decision on a
 * suggested profile value (Phase 10.3e), proxied to Spring's `/api/profile/suggestions/:id/…`.
 *
 * Accept may carry the user's edit (`{ value }`); the server writes it into the profile, applies
 * every rule, and 404s anything that isn't this user's undecided suggestion.
 */
const ACTIONS = new Set(["accept", "dismiss"]);
const MAX_VALUE = 500; // mirrors ProfileSuggestionService.MAX_VALUE

export async function POST(request: Request, ctx: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await ctx.params;
  if (!/^\d+$/.test(id) || !ACTIONS.has(action)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let forward: string | undefined;
  if (action === "accept") {
    const body = (await request.json().catch(() => null)) as { value?: unknown } | null;
    if (body && body.value !== undefined) {
      if (typeof body.value !== "string" || !body.value.trim() || body.value.length > MAX_VALUE) {
        return Response.json({ error: `A value must be 1 to ${MAX_VALUE} characters.` }, { status: 400 });
      }
      forward = JSON.stringify({ value: body.value });
    }
  }

  let res: Response;
  try {
    res = await serverApiFetch(`/api/profile/suggestions/${id}/${action}`, { method: "POST", body: forward });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }

  if (res.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }
  if (res.status === 404) {
    return Response.json({ error: "That suggestion is no longer there." }, { status: 404 });
  }
  if (res.status === 409) {
    return Response.json({ error: "Your profile couldn't be read. Open your profile and save it once, then try again." }, { status: 409 });
  }
  if (!res.ok) {
    return Response.json({ error: "Couldn't save that. Please try again." }, { status: 502 });
  }
  return Response.json({ ok: true });
}
