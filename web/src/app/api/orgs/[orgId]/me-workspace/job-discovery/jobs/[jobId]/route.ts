import { base, get, isId, notFound } from "@/lib/ent/consultant-ws/jobDiscovery-bff";

/** GET /api/orgs/{orgId}/me-workspace/job-discovery/jobs/{jobId}: one job's detail (another organization's job is a 404). */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; jobId: string }> }) {
  const { orgId, jobId } = await params;
  const b = base(orgId);
  return b && isId(jobId) ? get(`${b}/jobs/${jobId}`) : notFound();
}
