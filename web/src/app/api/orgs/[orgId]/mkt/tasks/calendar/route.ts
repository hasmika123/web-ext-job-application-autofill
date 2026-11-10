import { forward } from "@/lib/admin-proxy";

/** GET /api/orgs/{orgId}/mkt/tasks/calendar?month=yyyy-MM: the days of a month that have tasks (the Calendar card). */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/tasks/calendar${new URL(request.url).search}`, { headers: { accept: "application/json" } });
}
