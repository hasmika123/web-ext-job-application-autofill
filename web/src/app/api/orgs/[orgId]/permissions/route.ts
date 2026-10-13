import { forward, notFound, orgBase } from "@/lib/ent/roles-bff";

/** GET /api/orgs/{orgId}/permissions: the catalog, with what the caller may grant. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const b = orgBase((await params).orgId);
  return b ? forward(`${b}/permissions`) : notFound();
}
