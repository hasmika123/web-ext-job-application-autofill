import { forward } from "@/lib/admin-proxy";

/** Only these list parameters are passed on; the API validates every value and owns scope, permission and the tenant wall. */
const PARAMS = ["q", "status", "skill", "location", "experience", "availability", "sort", "page", "size"] as const;

/** GET /api/orgs/{orgId}/mkt/talent: the My Assigned Talent board (one call). */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  const src = new URL(req.url).searchParams;
  const out = new URLSearchParams();
  for (const k of PARAMS) {
    const v = src.get(k);
    if (v !== null && v.length <= 200) out.set(k, v);
  }
  const qs = out.toString();
  return forward(`/api/orgs/${orgId}/mkt/talent${qs ? `?${qs}` : ""}`, { headers: { accept: "application/json" } });
}
