import { ID_RX, forward, ifMatchHeaders, notFound, rolesPath } from "@/lib/ent/roles-bff";

/** POST: restore the role to the rows of its template (show the diff first); `If-Match` required. */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string; roleId: string }> }) {
  const { orgId, roleId } = await params;
  const p = rolesPath(orgId);
  return p && ID_RX.test(roleId) ? forward(`${p}/${roleId}/resync`, { method: "POST", headers: ifMatchHeaders(request) }) : notFound();
}
