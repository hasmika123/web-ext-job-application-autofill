import { forward, groupsPath, notFound } from "@/lib/ent/groups-bff";

/** GET /api/orgs/{orgId}/groups/structure: read-only, the query string goes through untouched (the API validates it). */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = groupsPath((await params).orgId);
  if (!p) return notFound();
  return forward(`${p}/structure${new URL(request.url).search}`);
}
