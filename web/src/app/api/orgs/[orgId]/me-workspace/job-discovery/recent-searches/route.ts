import { base, notFound, sendObject } from "@/lib/ent/consultant-ws/jobDiscovery-bff";

/** POST /api/orgs/{orgId}/me-workspace/job-discovery/recent-searches: remember a search that was just run (the latest 5 are kept). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const b = base((await params).orgId);
  return b ? sendObject(`${b}/recent-searches`, request) : notFound();
}
