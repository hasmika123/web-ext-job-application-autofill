import { forward } from "@/lib/admin-proxy";

/** GET /api/orgs/{orgId}/mkt/resumes/consultants: the consultants the caller may start a resume for (assigned ones for a marketer). */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/resumes/consultants`, { headers: { accept: "application/json" } });
}
