import { proxyCsv } from "@/lib/ent/marketer-ws/opportunities-bff";

/** GET /api/orgs/{orgId}/mkt/opportunities/export: the caller's visible rows as a CSV file (names and job facts only). */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return proxyCsv(req, orgId);
}
