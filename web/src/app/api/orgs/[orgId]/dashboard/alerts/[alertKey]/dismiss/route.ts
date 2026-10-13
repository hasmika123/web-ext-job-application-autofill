import { forward } from "@/lib/admin-proxy";

/** POST /api/orgs/{orgId}/dashboard/alerts/{alertKey}/dismiss: hide one alert for the caller for 7 days (X2.4). Shape check only. */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; alertKey: string }> }) {
  const { orgId, alertKey } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^[A-Z0-9_]{1,64}$/.test(alertKey)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/dashboard/alerts/${alertKey}/dismiss`, { method: "POST" });
}
