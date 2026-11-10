import { base, notFound, sendObject } from "@/lib/ent/consultant-ws/jobDiscovery-bff";

/** POST /api/orgs/{orgId}/me-workspace/job-discovery/saved-searches: save the current search under a name. */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const b = base((await params).orgId);
  return b ? sendObject(`${b}/saved-searches`, request) : notFound();
}
