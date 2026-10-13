import { proxyPost } from "@/lib/ent/marketer-ws/opportunities-bff";

/** POST /api/orgs/{orgId}/mkt/opportunities/bulk-assign {ids}: assign several ready opportunities (a request to the consultant follows; nothing is submitted). */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return proxyPost(orgId, "/bulk-assign", undefined, req, ["ids"]);
}
