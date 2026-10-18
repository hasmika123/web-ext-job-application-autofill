import { proxyGet } from "@/lib/ent/marketer-ws/opportunities-bff";

/** GET /api/orgs/{orgId}/mkt/opportunities/{id}: one opportunity with the same consultant's other open ones (Compare) and its timeline. */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  return proxyGet(req, orgId, "", id);
}
