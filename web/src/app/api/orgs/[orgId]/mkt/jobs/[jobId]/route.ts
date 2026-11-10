import { forward } from "@/lib/admin-proxy";

/** GET /api/orgs/{orgId}/mkt/jobs/{jobId}: one job with its description and the best matches among the consultants the caller may see. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; jobId: string }> }) {
  const { orgId, jobId } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(jobId)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/jobs/${jobId}`, { headers: { accept: "application/json" } });
}
