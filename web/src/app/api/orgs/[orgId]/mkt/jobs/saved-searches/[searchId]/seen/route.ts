import { forward } from "@/lib/admin-proxy";

/** POST /api/orgs/{orgId}/mkt/jobs/saved-searches/{searchId}/seen: the caller looked at this search, so its "N new" starts again from now. */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; searchId: string }> }) {
  const { orgId, searchId } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(searchId)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/jobs/saved-searches/${searchId}/seen`, { method: "POST", headers: { accept: "application/json" } });
}
