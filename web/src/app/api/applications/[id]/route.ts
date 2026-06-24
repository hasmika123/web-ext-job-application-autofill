import { serverApiFetch } from "@/lib/api";

/**
 * Mutations for one of the current user's tracked applications, proxied to Spring's
 * user-scoped `/api/profile/applications/:id`. The board uses these for manual status
 * moves, the "Did you submit?" nudge (status -> APPLIED + confirm), and dismiss/delete.
 * Ownership is enforced server-side (404 if not the caller's application).
 */
const STATUSES = ["DRAFT", "SAVED", "APPLIED", "INTERVIEW", "OFFER", "REJECTED"];

type PutBody = { status?: unknown; submissionConfirmed?: unknown; appliedAt?: unknown };

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return Response.json({ error: "Invalid application id." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as PutBody | null;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  // Whitelist only the fields the board is allowed to change.
  const forward: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !STATUSES.includes(body.status)) {
      return Response.json({ error: "Invalid status." }, { status: 400 });
    }
    forward.status = body.status;
  }
  if (typeof body.submissionConfirmed === "boolean") forward.submissionConfirmed = body.submissionConfirmed;
  if (typeof body.appliedAt === "string") forward.appliedAt = body.appliedAt;
  if (Object.keys(forward).length === 0) {
    return Response.json({ error: "Nothing to update." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await serverApiFetch(`/api/profile/applications/${id}`, {
      method: "PUT",
      body: JSON.stringify(forward),
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }

  if (res.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }
  if (res.status === 404) {
    return Response.json({ error: "Application not found." }, { status: 404 });
  }
  if (!res.ok) {
    return Response.json({ error: "Couldn't update the application." }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  return Response.json({ ok: true, application: data });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return Response.json({ error: "Invalid application id." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await serverApiFetch(`/api/profile/applications/${id}`, { method: "DELETE" });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }

  if (res.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }
  if (res.status === 404) {
    return Response.json({ error: "Application not found." }, { status: 404 });
  }
  if (!res.ok) {
    return Response.json({ error: "Couldn't delete the application." }, { status: 502 });
  }

  return Response.json({ ok: true });
}
