import { serverApiFetch } from "@/lib/api";

/**
 * Revoke one of a user's sessions (Phase 9.A2.3b): browser → Next → Spring
 * `POST /api/admin/users/{login}/sessions/{familyId}/revoke`. Spring enforces ROLE_ADMIN,
 * checks the family belongs to the user, and audits. Listing is done server-side on the page.
 */
export async function DELETE(_request: Request, ctx: { params: Promise<{ login: string; familyId: string }> }) {
  const { login, familyId } = await ctx.params;
  let res: Response;
  try {
    res = await serverApiFetch(
      `/api/admin/users/${encodeURIComponent(login)}/sessions/${encodeURIComponent(familyId)}/revoke`,
      { method: "POST" },
    );
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }

  if (res.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }
  if (res.status === 204 || res.ok) {
    return Response.json({ ok: true });
  }
  const data = await res.json().catch(() => ({}));
  const error =
    (data as { detail?: string; title?: string; message?: string }).detail ??
    (data as { title?: string }).title ??
    (data as { message?: string }).message ??
    "Couldn't revoke the session.";
  return Response.json({ error }, { status: res.status });
}
