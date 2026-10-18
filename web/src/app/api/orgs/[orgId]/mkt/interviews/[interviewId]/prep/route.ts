import { forward } from "@/lib/admin-proxy";

/** GET /api/orgs/{orgId}/mkt/interviews/{interviewId}/prep: the Preparation Checklist of one interview (created on first read). */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; interviewId: string }> }) {
  const { orgId, interviewId } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(interviewId)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/interviews/${interviewId}/prep`, { headers: { accept: "application/json" } });
}
