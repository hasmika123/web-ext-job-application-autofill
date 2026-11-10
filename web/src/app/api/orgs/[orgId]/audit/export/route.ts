import { proxyOrgCsv } from "@/lib/ent/csv-bff";

/** GET /api/orgs/{orgId}/audit/export: the filtered audit log as a CSV file (the export itself is audited by the API). */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return proxyOrgCsv(req, orgId, "audit/export", ["action", "from", "to"], "audit-log.csv");
}
