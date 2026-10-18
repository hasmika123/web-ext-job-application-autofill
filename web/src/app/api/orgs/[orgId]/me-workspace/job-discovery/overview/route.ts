import { base, get, notFound } from "@/lib/ent/consultant-ws/jobDiscovery-bff";

/** GET /api/orgs/{orgId}/me-workspace/job-discovery/overview: filter options, recommended filters, trending skills, saved and recent searches. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const b = base((await params).orgId);
  return b ? get(`${b}/overview`) : notFound();
}
