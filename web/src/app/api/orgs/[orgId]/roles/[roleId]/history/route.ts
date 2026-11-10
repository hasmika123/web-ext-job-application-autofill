import { ID_RX, forward, limitParam, notFound, rolesPath } from "@/lib/ent/roles-bff";

/** GET: the change history of one role (roles.manage). */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string; roleId: string }> }) {
  const { orgId, roleId } = await params;
  const p = rolesPath(orgId);
  return p && ID_RX.test(roleId) ? forward(`${p}/${roleId}/history${limitParam(request)}`) : notFound();
}
