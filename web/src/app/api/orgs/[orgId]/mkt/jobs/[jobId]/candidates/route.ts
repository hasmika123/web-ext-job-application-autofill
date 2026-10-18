import { forward } from "@/lib/admin-proxy";

/** GET /api/orgs/{orgId}/mkt/jobs/{jobId}/candidates?q=: the consultants the caller may assign to this job (the assignment picker). */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string; jobId: string }> }) {
  const { orgId, jobId } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(jobId)) return Response.json({ error: "Not found." }, { status: 404 });
  const q = new URL(req.url).searchParams.get("q");
  const qs = q && q.length <= 200 ? `?q=${encodeURIComponent(q)}` : "";
  return forward(`/api/orgs/${orgId}/mkt/jobs/${jobId}/candidates${qs}`, { headers: { accept: "application/json" } });
}
