import { forward } from "@/lib/admin-proxy";

const ALLOWED = ["consultant", "status"] as const;

/** GET /api/orgs/{orgId}/mkt/matches/canonical: source-labelled canonical opportunity matches for the marketer migration. */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  const incoming = new URL(req.url).searchParams;
  const out = new URLSearchParams();
  for (const key of ALLOWED) {
    const value = incoming.get(key);
    if (value !== null && value.length <= 200) out.set(key, value);
  }
  const qs = out.toString();
  return forward(`/api/orgs/${orgId}/mkt/matches/canonical${qs ? `?${qs}` : ""}`, { headers: { accept: "application/json" } });
}
