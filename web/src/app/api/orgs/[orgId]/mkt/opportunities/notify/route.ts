import { proxyPost } from "@/lib/ent/marketer-ws/opportunities-bff";

/** POST /api/orgs/{orgId}/mkt/opportunities/notify: ask every consultant who has not answered for their interest (a request only). */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return proxyPost(orgId, "/notify");
}
