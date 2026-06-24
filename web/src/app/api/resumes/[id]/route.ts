import { serverApiFetch } from "@/lib/api";

/**
 * PUT /api/resumes/:id — archive or unarchive one of the current user's resumes.
 *
 * A focused proxy over Spring's partial `PUT /api/profile/resumes/:id`: it forwards
 * only the `archived` flag, so this path can't be used to rewrite a resume's label or
 * parsed data. Ownership is enforced server-side (404 if not the caller's resume).
 */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return Response.json({ error: "Invalid resume id." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { archived?: unknown } | null;
  if (typeof body?.archived !== "boolean") {
    return Response.json({ error: "Expected an 'archived' boolean." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await serverApiFetch(`/api/profile/resumes/${id}`, {
      method: "PUT",
      body: JSON.stringify({ archived: body.archived }),
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }

  if (res.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }
  if (res.status === 404) {
    return Response.json({ error: "Resume not found." }, { status: 404 });
  }
  if (!res.ok) {
    return Response.json({ error: "Couldn't update the resume." }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  return Response.json({ ok: true, id: Number(id), archived: data.archived ?? body.archived });
}

/**
 * DELETE /api/resumes/:id — delete one of the current user's resumes.
 *
 * Blocked (409) by the server's archive guard when any application references the
 * resume; we pass that nudge message through so the UI can suggest archiving instead.
 */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return Response.json({ error: "Invalid resume id." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await serverApiFetch(`/api/profile/resumes/${id}`, { method: "DELETE" });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }

  if (res.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }
  if (res.status === 404) {
    return Response.json({ error: "Resume not found." }, { status: 404 });
  }
  if (res.status === 409) {
    // Spring's ResponseStatusException → ProblemDetail with the nudge in `detail`.
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    return Response.json(
      { error: data.detail ?? "This resume is used by a tracked application — archive it instead." },
      { status: 409 },
    );
  }
  if (!res.ok) {
    return Response.json({ error: "Couldn't delete the resume." }, { status: 502 });
  }

  return Response.json({ ok: true });
}
