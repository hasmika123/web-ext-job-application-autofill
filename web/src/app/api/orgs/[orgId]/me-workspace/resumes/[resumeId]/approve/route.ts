import { forward } from "@/lib/admin-proxy";

/** POST /api/orgs/{orgId}/me-workspace/resumes/{resumeId}/approve: the consultant approves a resume a marketer made or edited for them. No body. */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; resumeId: string }> }) {
  const { orgId, resumeId } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(resumeId)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/me-workspace/resumes/${resumeId}/approve`, { method: "POST", headers: { accept: "application/json" } });
}
