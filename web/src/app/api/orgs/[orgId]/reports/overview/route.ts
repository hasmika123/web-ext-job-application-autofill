import { forward } from "@/lib/admin-proxy";

/**
 * GET /api/orgs/{orgId}/reports/overview?range=30|90: the Org Admin Reports numbers. The BFF checks only the SHAPE (a numeric id, a range of 30 or 90);
 * the API owns every rule (permission, ORG scope, tenant wall) and answers the same generic 404 to everyone else.
 */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  const range = new URL(req.url).searchParams.get("range");
  if (range !== null && !/^(30|90)$/.test(range)) return Response.json({ error: "Range must be 30 or 90." }, { status: 400 });
  return forward(`/api/orgs/${orgId}/reports/overview${range ? `?range=${range}` : ""}`, { headers: { accept: "application/json" } });
}
