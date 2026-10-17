import { forward } from "@/lib/admin-proxy";

/** GET /api/orgs/{orgId}/org-settings: the General and Security settings with the platform bounds. The API owns every rule. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/org-settings`);
}
