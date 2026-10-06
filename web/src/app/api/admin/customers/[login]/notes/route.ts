import { serverApiFetch } from "@/lib/api";

/** POST /api/admin/customers/[login]/notes — add a customer note (Phase 9.C1), proxied to Spring (ADMIN-gated, audited). */
export async function POST(request: Request, ctx: { params: Promise<{ login: string }> }) {
  const { login } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { body?: unknown } | null;
  if (!body || typeof body.body !== "string" || !body.body.trim()) {
    return Response.json({ error: "A note can't be empty." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await serverApiFetch(`/api/admin/customers/${encodeURIComponent(login)}/notes`, {
      method: "POST",
      body: JSON.stringify({ body: body.body }),
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (res.status === 401) return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string; title?: string };
    return Response.json({ error: data.detail ?? data.title ?? "Couldn't save the note." }, { status: res.status });
  }
  return Response.json({ ok: true }, { status: 201 });
}
