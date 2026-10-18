import { proxyOrgCsv } from "@/lib/ent/csv-bff";

/** GET /api/orgs/{orgId}/reports/export: the reports overview as a CSV file (the export itself is audited by the API). */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return proxyOrgCsv(req, orgId, "reports/export", ["range"], "reports.csv");
}
