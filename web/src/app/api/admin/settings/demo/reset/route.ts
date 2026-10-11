import { serverApiFetch } from "@/lib/api";

/**
 * POST /api/admin/settings/demo/reset — wipe the demo accounts' data and re-seed the job seeker.
 * Spring enforces ROLE_ADMIN and audits it.
 */
export async function POST() {
  let res: Response;
  try {
    res = await serverApiFetch("/api/admin/settings/demo/reset", { method: "POST" });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (res.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error =
      (data as { detail?: string }).detail ?? (data as { title?: string }).title ?? "Couldn't reset the demo data.";
    return Response.json({ error }, { status: res.status });
  }
  return Response.json({ ok: true, ...data });
}
