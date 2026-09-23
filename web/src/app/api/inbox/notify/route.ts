import { serverApiFetch } from "@/lib/api";

/** PUT /api/inbox/notify `{ email }` — emails about interviews and offers on or off (Phase 14.6). */
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  if (typeof body?.email !== "boolean") return Response.json({ error: "Say on or off." }, { status: 400 });
  let res: Response;
  try {
    res = await serverApiFetch("/api/profile/inbox/notify", { method: "PUT", body: JSON.stringify({ email: body.email }) });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (!res.ok) return Response.json({ error: "Couldn't change that right now." }, { status: 502 });
  return Response.json(await res.json().catch(() => ({})));
}
