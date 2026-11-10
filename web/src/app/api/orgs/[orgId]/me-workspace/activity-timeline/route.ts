import { forward } from "@/lib/admin-proxy";

/**
 * GET /api/orgs/{orgId}/me-workspace/activity-timeline: the signed-in consultant's own merged activity feed (Consultant workspace). The BFF checks
 * only the SHAPE of the id (numeric) and of the query (type / days / size / cursor, each a plain token); the API owns every rule (permission,
 * tenant wall, "only your own events"). Read-only page: no other verbs.
 */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  const url = new URL(request.url);
  const out = new URLSearchParams();
  const type = url.searchParams.get("type");
  const days = url.searchParams.get("days");
  const size = url.searchParams.get("size");
  const cursor = url.searchParams.get("cursor");
  if (type && /^[A-Z_]{1,24}$/.test(type)) out.set("type", type);
  if (days && /^\d{1,3}$/.test(days)) out.set("days", days);
  if (size && /^\d{1,3}$/.test(size)) out.set("size", size);
  if (cursor && /^[A-Za-z0-9_-]{1,300}$/.test(cursor)) out.set("cursor", cursor);
  const q = out.toString();
  return forward(`/api/orgs/${orgId}/me-workspace/activity-timeline${q ? `?${q}` : ""}`, { headers: { accept: "application/json" } });
}
