import { forward } from "@/lib/admin-proxy";

const PARAMS = ["q", "skills", "location", "workType", "visa", "source", "rateMin", "rateMax", "sort", "page", "size"] as const;

/** GET /api/orgs/{orgId}/mkt/jobs: the Job Discovery board (one call; filters ride as query params). The API owns permission (matches.run), scope and the tenant wall. */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  const from = new URL(req.url).searchParams;
  const to = new URLSearchParams();
  for (const k of PARAMS) {
    const v = from.get(k);
    if (v !== null && v.length <= 400) to.set(k, v);
  }
  const qs = to.toString();
  return forward(`/api/orgs/${orgId}/mkt/jobs${qs ? `?${qs}` : ""}`, { headers: { accept: "application/json" } });
}
