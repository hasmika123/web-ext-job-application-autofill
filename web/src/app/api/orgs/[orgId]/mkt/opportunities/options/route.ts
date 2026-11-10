import { proxyGet } from "@/lib/ent/marketer-ws/opportunities-bff";

/** GET /api/orgs/{orgId}/mkt/opportunities/options: consultants in the caller's scope and open jobs (Add Opportunity). */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return proxyGet(req, orgId, "/options");
}
