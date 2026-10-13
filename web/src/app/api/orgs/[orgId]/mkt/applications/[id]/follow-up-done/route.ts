import { forward } from "@/lib/admin-proxy";

/** POST /api/orgs/{orgId}/mkt/applications/{id}/follow-up-done: mark the follow-up done (followups.manage). A record only (E1); the API owns permission, scope and consent. */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/applications/${id}/follow-up-done`, { method: "POST", headers: { accept: "application/json" } });
}
