import { forward } from "@/lib/admin-proxy";
import { notFound, orgOk } from "@/lib/ent/members-bff";

/** GET /api/orgs/{orgId}/roles: the roles the role picker and the Role filter offer (X1.14). */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return orgOk(orgId) ? forward(`/api/orgs/${orgId}/roles`) : notFound();
}
