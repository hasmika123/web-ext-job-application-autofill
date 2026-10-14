import { proxyGet } from "@/lib/ent/consultant-ws/opportunities-bff";

/** GET /api/orgs/{orgId}/consultant/opportunities (forwarded to the API's /con/opportunities): the signed-in consultant's Assigned Opportunities (`?state=&page=&size=`). The API resolves WHICH consultant from the session, never from a parameter. */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return proxyGet(req, orgId);
}
