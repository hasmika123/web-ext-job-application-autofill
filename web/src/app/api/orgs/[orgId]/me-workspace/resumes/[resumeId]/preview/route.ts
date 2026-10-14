import { forward } from "@/lib/admin-proxy";

/** GET /api/orgs/{orgId}/me-workspace/resumes/{resumeId}/preview: the structured fields one of the caller's own resumes is drawn from. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; resumeId: string }> }) {
  const { orgId, resumeId } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(resumeId)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/me-workspace/resumes/${resumeId}/preview`, { headers: { accept: "application/json" } });
}
