import { forward } from "@/lib/admin-proxy";

/** GET /api/orgs/{orgId}/mkt/talent/{consultantId}: the read-only consultant summary behind "View Profile". */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; consultantId: string }> }) {
  const { orgId, consultantId } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(consultantId)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/talent/${consultantId}`, { headers: { accept: "application/json" } });
}
