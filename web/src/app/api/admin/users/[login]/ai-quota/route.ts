import { serverApiFetch } from "@/lib/api";

/**
 * Per-user AI override proxy (Phase 9.A2.2b): browser → Next → Spring
 * `/api/admin/users/{login}/ai-quota`. Spring enforces ROLE_ADMIN, clamps the value, and audits.
 * Since 13.1b the override is a monthly AI budget in US cents. GET is done server-side in the
 * detail page; this handles the client-side PUT/DELETE.
 */
export async function PUT(request: Request, ctx: { params: Promise<{ login: string }> }) {
  const { login } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { budgetCents?: unknown } | null;
  const budgetCents = body?.budgetCents;
  if (typeof budgetCents !== "number" || !Number.isInteger(budgetCents) || budgetCents < 0) {
    return Response.json({ error: "The budget must be a dollar amount of $0 or more." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await serverApiFetch(`/api/admin/users/${encodeURIComponent(login)}/ai-quota`, {
      method: "PUT",
      body: JSON.stringify({ budgetCents }),
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  return passthrough(res);
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ login: string }> }) {
  const { login } = await ctx.params;
  let res: Response;
  try {
    res = await serverApiFetch(`/api/admin/users/${encodeURIComponent(login)}/ai-quota`, { method: "DELETE" });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  return passthrough(res);
}

async function passthrough(res: Response): Promise<Response> {
  if (res.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }
  if (res.status === 204) {
    return Response.json({ ok: true });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error =
      (data as { detail?: string; title?: string; message?: string }).detail ??
      (data as { title?: string }).title ??
      (data as { message?: string }).message ??
      "The action failed.";
    return Response.json({ error }, { status: res.status });
  }
  return Response.json({ ok: true, ...data });
}
