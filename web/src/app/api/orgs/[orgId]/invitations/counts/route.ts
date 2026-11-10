import { forward, notFound, orgPath } from "@/lib/ent/invitations-bff";

/** GET /api/orgs/{orgId}/invitations/counts: Pending, Accepted, Expired, Revoked with the change against last month. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = orgPath((await params).orgId);
  return p ? forward(`${p}/counts`) : notFound();
}
