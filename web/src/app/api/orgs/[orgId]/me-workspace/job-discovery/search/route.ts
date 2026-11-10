import { base, get, notFound } from "@/lib/ent/consultant-ws/jobDiscovery-bff";

/** GET /api/orgs/{orgId}/me-workspace/job-discovery/search?q=&location=&...: the search runs in the API; the query string passes through untouched. */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const b = base((await params).orgId);
  if (!b) return notFound();
  const qs = new URL(request.url).searchParams.toString();
  return get(`${b}/search${qs ? `?${qs}` : ""}`);
}
