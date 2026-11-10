import { forward } from "@/lib/admin-proxy";

/** POST .../approve: only a holder of resumes.approve_request (the org admin) gets past the API, and never for their own request. */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/resumes/${id}/approve`, { method: "POST", headers: { accept: "application/json" } });
}
