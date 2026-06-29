import { serverApiFetch } from "@/lib/api";

/**
 * Admin user-action proxy (Phase 9.A1.4b): browser → Next → Spring `/api/admin/users/{login}/…`.
 * Spring enforces ROLE_ADMIN, audits every action, and blocks self-harming ones (400). This
 * handler just whitelists the action verbs and passes the upstream status/message through.
 */
const ACTIONS = new Set(["activate", "deactivate", "grant-admin", "revoke-admin", "reset-password", "force-logout"]);

type PostBody = { action?: unknown };

export async function POST(request: Request, ctx: { params: Promise<{ login: string }> }) {
  const { login } = await ctx.params;
  const body = (await request.json().catch(() => null)) as PostBody | null;
  const action = typeof body?.action === "string" ? body.action : "";
  if (!ACTIONS.has(action)) {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await serverApiFetch(`/api/admin/users/${encodeURIComponent(login)}/${action}`, { method: "POST" });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  return passthrough(res);
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ login: string }> }) {
  const { login } = await ctx.params;
  let res: Response;
  try {
    res = await serverApiFetch(`/api/admin/users/${encodeURIComponent(login)}/data`, { method: "DELETE" });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  return passthrough(res);
}

/** Forward the upstream result, mapping common failures to friendly messages. */
async function passthrough(res: Response): Promise<Response> {
  if (res.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }
  if (res.status === 204) {
    return Response.json({ ok: true });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Spring sends a `detail`/`title` on ProblemDetail/ResponseStatusException errors.
    const error =
      (data as { detail?: string; title?: string; message?: string }).detail ??
      (data as { title?: string }).title ??
      (data as { message?: string }).message ??
      "The action failed.";
    return Response.json({ error }, { status: res.status });
  }
  return Response.json({ ok: true, user: data });
}
