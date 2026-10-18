import { forward, notFound, rolesPath } from "@/lib/ent/roles-bff";

/** GET /api/orgs/{orgId}/roles/overview: the Roles & Permissions page's data (table, counts, permission overview). */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const p = rolesPath((await params).orgId);
  return p ? forward(`${p}/overview`) : notFound();
}
