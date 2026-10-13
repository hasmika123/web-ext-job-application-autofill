import { forward, limitParam, notFound, rolesPath } from "@/lib/ent/roles-bff";

/** GET /api/orgs/{orgId}/roles/history: every role change in the organization, newest first (roles.manage). */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = rolesPath((await params).orgId);
  return p ? forward(`${p}/history${limitParam(request)}`) : notFound();
}
