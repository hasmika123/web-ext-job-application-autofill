import { proxyGet, proxyPost } from "@/lib/ent/marketer-ws/opportunities-bff";

/** GET /api/orgs/{orgId}/mkt/opportunities: the Opportunities board (one call, board filters in the query). POST: add an opportunity (a SUGGESTED match; the API owns scope). */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return proxyGet(req, orgId);
}

export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return proxyPost(orgId, "", undefined, req, ["consultantId", "requirementId"]);
}
