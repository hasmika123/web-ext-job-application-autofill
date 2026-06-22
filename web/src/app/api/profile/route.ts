import { serverApiFetch } from "@/lib/api";

/**
 * PUT /api/profile — save the current user's bio.
 *
 * The bio is stored server-side as one opaque JSON string (`payload`) — the same
 * canonical shape the extension reads/writes, so edits round-trip between web and
 * extension. The client owns the merge (it preserves fields it doesn't edit, e.g. the
 * extension's EEO answers); this handler just forwards the payload with the bearer token.
 */
const MAX_PAYLOAD = 100 * 1024; // generous for a JSON bio; guards against abuse

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as { payload?: unknown } | null;
  if (typeof body?.payload !== "string") {
    return Response.json({ error: "Expected a 'payload' string." }, { status: 400 });
  }
  if (body.payload.length > MAX_PAYLOAD) {
    return Response.json({ error: "Profile is too large." }, { status: 413 });
  }

  let res: Response;
  try {
    res = await serverApiFetch("/api/profile", {
      method: "PUT",
      body: JSON.stringify({ payload: body.payload }),
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }

  if (res.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }
  if (!res.ok) {
    return Response.json({ error: "Couldn't save your profile." }, { status: 502 });
  }

  return Response.json({ ok: true });
}
