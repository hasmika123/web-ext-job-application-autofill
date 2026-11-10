import { forward } from "@/lib/admin-proxy";

/**
 * GET /api/orgs/{orgId}/audit/job-data: job data provenance and ledger (read only, MKT-46). The BFF checks only the SHAPE (a numeric org id, the
 * five known query parameters); the API owns every rule (audit.view at ORG scope, the tenant wall, paging bounds) and answers the generic 404 otherwise.
 */
const ALLOWED = ["jobId", "from", "to", "page", "size"];

export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  const incoming = new URL(request.url).searchParams;
  const out = new URLSearchParams();
  for (const k of ALLOWED) {
    const v = incoming.get(k);
    if (v !== null && v !== "") out.set(k, v);
  }
  const qs = out.toString();
  return forward(`/api/orgs/${orgId}/audit/job-data${qs ? `?${qs}` : ""}`, { headers: { accept: "application/json" } });
}
