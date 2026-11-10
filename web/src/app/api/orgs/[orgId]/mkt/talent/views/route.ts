import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

const FIELDS = ["name", "q", "status", "skill", "location", "experience", "availability"] as const;

/** POST /api/orgs/{orgId}/mkt/talent/views: save (or overwrite by name) one of the caller's own filter sets. Filters only; no consultant data. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(req);
  if (!body) return badBody("A saved view needs a JSON body.");
  const extra = onlyFields(body, FIELDS);
  if (extra) return badBody(extra);
  return forward(`/api/orgs/${orgId}/mkt/talent/views`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
}
