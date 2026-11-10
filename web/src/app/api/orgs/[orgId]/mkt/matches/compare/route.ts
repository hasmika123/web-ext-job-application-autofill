import { forward } from "@/lib/admin-proxy";

/** GET /api/orgs/{orgId}/mkt/matches/compare?a=&b=: two matches side by side (the Compare drawer). */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const sp = new URL(req.url).searchParams;
  const a = sp.get("a") ?? "";
  const b = sp.get("b") ?? "";
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(a) || !/^\d{1,18}$/.test(b)) return Response.json({ error: "Not found." }, { status: 404 });
  return forward(`/api/orgs/${orgId}/mkt/matches/compare?a=${a}&b=${b}`, { headers: { accept: "application/json" } });
}
