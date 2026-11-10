import { forward } from "@/lib/admin-proxy";

/**
 * GET /api/orgs/{orgId}/audit: the organization audit log (read only). The BFF checks only the SHAPE (a numeric org id, the five known query
 * parameters); the API owns every rule (audit.view at ORG scope, the tenant wall, paging bounds).
 */
const ALLOWED = ["action", "from", "to", "page", "size"];

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
  return forward(`/api/orgs/${orgId}/audit${qs ? `?${qs}` : ""}`, { headers: { accept: "application/json" } });
}
