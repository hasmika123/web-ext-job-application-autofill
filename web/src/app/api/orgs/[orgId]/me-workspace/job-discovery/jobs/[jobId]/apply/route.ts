import { base, isId, notFound, send } from "@/lib/ent/consultant-ws/jobDiscovery-bff";

/** POST /api/orgs/{orgId}/me-workspace/job-discovery/jobs/{jobId}/apply: the consultant's own intent only; Kiwiply never submits. */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; jobId: string }> }) {
  const { orgId, jobId } = await params;
  const b = base(orgId);
  return b && isId(jobId) ? send(`${b}/jobs/${jobId}/apply`, "POST") : notFound();
}
