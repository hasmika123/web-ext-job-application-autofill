import { proxyGet } from "@/lib/ent/consultant-ws/opportunities-bff";

/** GET /api/orgs/{orgId}/consultant/opportunities/{id}: one assigned job, with the actions the API allows right now. */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  return proxyGet(req, orgId, id);
}
