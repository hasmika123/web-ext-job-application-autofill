import { forward, listQuery, notFound, orgPath } from "@/lib/ent/invitations-bff";

/** GET /api/orgs/{orgId}/invitations/activity: the latest invited / accepted / revoked / expired events. */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = orgPath((await params).orgId);
  return p ? forward(`${p}/activity${listQuery(req.url, ["limit"])}`) : notFound();
}
