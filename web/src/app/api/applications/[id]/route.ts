import { serverApiFetch } from "@/lib/api";

/**
 * Mutations for one of the current user's tracked applications, proxied to Spring's
 * user-scoped `/api/profile/applications/:id`. The board uses these for manual status
 * moves, the "Did you submit?" nudge (status -> APPLIED + confirm), and dismiss/delete.
 * Ownership is enforced server-side (404 if not the caller's application).
 */
const STATUSES = ["DRAFT", "SAVED", "APPLIED", "INTERVIEW", "OFFER", "REJECTED"];

type PutBody = {
  status?: unknown;
  submissionConfirmed?: unknown;
  appliedAt?: unknown;
  resumeId?: unknown;
  // Manual detail edits from the board's detail panel.
  company?: unknown;
  roleTitle?: unknown;
  location?: unknown;
  jobUrl?: unknown;
  jobDescription?: unknown;
};

// Editable text fields: [key, max length, required-non-empty].
const TEXT_FIELDS: [keyof PutBody, number, boolean][] = [
  ["company", 200, true],
  ["roleTitle", 200, true],
  ["location", 200, false],
  ["jobUrl", 2000, false],
  ["jobDescription", 20000, false],
];

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
  if (body.resumeId !== undefined) {
    const n = typeof body.resumeId === "number" ? body.resumeId : typeof body.resumeId === "string" && /^\d+$/.test(body.resumeId) ? Number(body.resumeId) : NaN;
    if (!Number.isInteger(n) || n <= 0) {
      return Response.json({ error: "Invalid resume id." }, { status: 400 });
    }
    forward.resume = { id: n }; // Spring links it only if the current user owns the resume
  }
  for (const [key, max, required] of TEXT_FIELDS) {
    const raw = body[key];
    if (raw === undefined) continue;
    if (typeof raw !== "string") {
      return Response.json({ error: `Invalid ${key}.` }, { status: 400 });
    }
    const v = raw.trim().slice(0, max);
    if (required && v === "") {
      return Response.json({ error: `${key} can't be empty.` }, { status: 400 });
    }
    forward[key] = v;
  }
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
