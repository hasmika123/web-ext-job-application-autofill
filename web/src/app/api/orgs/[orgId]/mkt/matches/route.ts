import { forward } from "@/lib/admin-proxy";

const ALLOWED = ["page", "size", "q", "consultantId", "skill", "clientId", "score", "sort", "selected"] as const;

/**
 * GET /api/orgs/{orgId}/mkt/matches: the Job Matches board (one call). Only the board's own filters are passed on (shape-checked, the API
 * validates the values); the API owns scope (ASSIGNED), permission and the tenant wall.
 */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  const incoming = new URL(req.url).searchParams;
  const out = new URLSearchParams();
  for (const key of ALLOWED) {
    const v = incoming.get(key);
    if (v !== null && v.length <= 200) out.set(key, v);
  }
  const qs = out.toString();
  return forward(`/api/orgs/${orgId}/mkt/matches${qs ? `?${qs}` : ""}`, { headers: { accept: "application/json" } });
}
