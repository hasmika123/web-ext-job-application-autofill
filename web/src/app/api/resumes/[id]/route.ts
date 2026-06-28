import { serverApiFetch } from "@/lib/api";
import { LIMITS } from "@/lib/validate";

/**
 * PUT /api/resumes/:id — partial update of one of the current user's resumes.
 *
 * Proxies Spring's partial `PUT /api/profile/resumes/:id`, forwarding only a whitelist of
 * fields: `archived` (archive/restore) and `label` + `parsedJson` (the "edit" flow, which
 * reopens the review editor and re-saves the parsed structure — the stored file is left
 * untouched). Ownership is enforced server-side (404 if not the caller's resume).
 */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return Response.json({ error: "Invalid resume id." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as
    | { archived?: unknown; label?: unknown; parsedJson?: unknown }
    | null;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const forward: Record<string, unknown> = {};
  if (body.archived !== undefined) {
    if (typeof body.archived !== "boolean") {
      return Response.json({ error: "'archived' must be a boolean." }, { status: 400 });
    }
    forward.archived = body.archived;
  }
  if (body.label !== undefined) {
    if (typeof body.label !== "string" || !body.label.trim()) {
      return Response.json({ error: "'label' must be a non-empty string." }, { status: 400 });
    }
    if (body.label.trim().length > LIMITS.resumeLabelServer) {
      return Response.json(
        { error: `Resume name is too long (max ${LIMITS.resumeLabelServer} characters).` },
        { status: 400 },
      );
    }
    forward.label = body.label.trim();
  }
  if (body.parsedJson !== undefined) {
    if (typeof body.parsedJson !== "string") {
      return Response.json({ error: "'parsedJson' must be a string." }, { status: 400 });
    }
    forward.parsedJson = body.parsedJson;
  }
  if (Object.keys(forward).length === 0) {
    return Response.json({ error: "Nothing to update." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await serverApiFetch(`/api/profile/resumes/${id}`, {
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
    return Response.json({ error: "Resume not found." }, { status: 404 });
  }
  if (!res.ok) {
    return Response.json({ error: "Couldn't update the resume." }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  return Response.json({ ok: true, id: Number(id), label: data.label, archived: data.archived });
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
