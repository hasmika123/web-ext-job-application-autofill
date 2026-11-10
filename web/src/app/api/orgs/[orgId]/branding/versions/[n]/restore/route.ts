import { forward, notFound, orgPath } from "@/lib/ent/branding-bff";

/** POST /api/orgs/{orgId}/branding/versions/{n}/restore: copies a published version into the draft (does not publish). */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; n: string }> }) {
  const { orgId, n } = await params;
  const p = orgPath(orgId);
  if (!p || !/^\d{1,6}$/.test(n)) return notFound();
  return forward(`${p}/versions/${n}/restore`, { method: "POST" });
}
