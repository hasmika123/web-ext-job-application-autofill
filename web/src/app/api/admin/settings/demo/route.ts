import { serverApiFetch } from "@/lib/api";

/**
 * Admin demo switch proxy (phase demo): browser -> Next -> Spring `/api/admin/settings/demo`.
 * Spring enforces ROLE_ADMIN and writes the audit entry; this only forwards. GET is also read
 * server-side by the System page; the client card uses PUT (flip the switch).
 */
export async function GET() {
  let res: Response;
  try {
    res = await serverApiFetch("/api/admin/settings/demo");
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  return passthrough(res);
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return Response.json({ error: "Expected 'enabled' to be true or false." }, { status: 400 });
  }
  let res: Response;
  try {
    res = await serverApiFetch("/api/admin/settings/demo", {
      method: "PUT",
      body: JSON.stringify({ enabled: body.enabled }),
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  return passthrough(res);
}

async function passthrough(res: Response): Promise<Response> {
  if (res.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error =
      (data as { detail?: string }).detail ?? (data as { title?: string }).title ?? "The action failed.";
    return Response.json({ error }, { status: res.status });
  }
  return Response.json({ ok: true, ...data });
}
