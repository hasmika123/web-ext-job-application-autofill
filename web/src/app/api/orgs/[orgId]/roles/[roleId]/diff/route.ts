import { ID_RX, forward, notFound, rolesPath } from "@/lib/ent/roles-bff";

/** GET: the role compared with the template it was made from. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; roleId: string }> }) {
  const { orgId, roleId } = await params;
  const p = rolesPath(orgId);
  return p && ID_RX.test(roleId) ? forward(`${p}/${roleId}/diff`) : notFound();
}
