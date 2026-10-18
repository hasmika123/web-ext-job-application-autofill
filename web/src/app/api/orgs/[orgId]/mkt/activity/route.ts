import { badBody, forward, readObject } from "@/lib/admin-proxy";

const ID = /^\d{1,18}$/;
const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

/** GET /api/orgs/{orgId}/mkt/activity?from=&to=&type=...: the Activities board (one call). The API owns scope (ASSIGNED), permission and the tenant wall. */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!ID.test(orgId)) return notFound();
  return forward(`/api/orgs/${orgId}/mkt/activity${new URL(request.url).search}`, { headers: { accept: "application/json" } });
}

/** POST /api/orgs/{orgId}/mkt/activity: "Log Activity" for one of the caller's consultants (record only: it submits nothing for anyone). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!ID.test(orgId)) return notFound();
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  return forward(`/api/orgs/${orgId}/mkt/activity`, { method: "POST", body: JSON.stringify(body) });
}
