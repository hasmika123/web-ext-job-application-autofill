import { serverApiFetch } from "@/lib/api";

/** PUT /api/admin/inquiries/[id] — "Contact us" follow-up (Phase 15.6), proxied to Spring (ADMIN-gated, audited). */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return Response.json({ error: "Invalid id." }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as { status?: unknown; adminNotes?: unknown } | null;
  if (!body || typeof body.status !== "string") {
    return Response.json({ error: "A status is required." }, { status: 400 });
  }
  const forward = {
    status: body.status,
    adminNotes: typeof body.adminNotes === "string" ? body.adminNotes : null,
  };

  let res: Response;
  try {
    res = await serverApiFetch(`/api/admin/inquiries/${id}`, { method: "PUT", body: JSON.stringify(forward) });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (res.status === 401) return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = (data as { detail?: string; title?: string }).detail ?? (data as { title?: string }).title ?? "The update failed.";
    return Response.json({ error }, { status: res.status });
  }
  return Response.json({ ok: true, inquiry: data });
}
