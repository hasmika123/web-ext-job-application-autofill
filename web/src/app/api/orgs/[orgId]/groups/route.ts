import { forward } from "@/lib/admin-proxy";
import { notFound, orgOk } from "@/lib/ent/members-bff";

/** GET /api/orgs/{orgId}/groups: the departments and teams of the filters and the Move dialog. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return orgOk(orgId) ? forward(`/api/orgs/${orgId}/groups`) : notFound();
}
