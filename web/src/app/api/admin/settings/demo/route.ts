import { serverApiFetch } from "@/lib/api";

/**
 * Admin demo status proxy (phase demo): browser -> Next -> Spring `/api/admin/settings/demo`.
 * Spring enforces ROLE_ADMIN; this only forwards. Read-only: the on/off switch is server config
 * (`DEMO_ENABLED` on the API), so there is no PUT. GET is read server-side by the System page.
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
