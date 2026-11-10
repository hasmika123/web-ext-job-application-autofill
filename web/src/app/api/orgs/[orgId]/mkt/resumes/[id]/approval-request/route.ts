import { forward } from "@/lib/admin-proxy";

/** POST .../approval-request: the marketer ASKS the org admin to approve; this never approves anything. */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/resumes/${id}/approval-request`, { method: "POST", headers: { accept: "application/json" } });
}
