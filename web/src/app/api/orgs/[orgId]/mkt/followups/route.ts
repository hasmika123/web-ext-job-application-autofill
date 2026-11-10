import { badBody, forward, readObject } from "@/lib/admin-proxy";

const ID = /^\d{1,18}$/;
const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

/** GET /api/orgs/{orgId}/mkt/followups?window=&size=&q=: the Follow-ups board (one call). The API owns scope (ASSIGNED), permission and the tenant wall. */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!ID.test(orgId)) return notFound();
  return forward(`/api/orgs/${orgId}/mkt/followups${new URL(request.url).search}`, { headers: { accept: "application/json" } });
}

/** POST /api/orgs/{orgId}/mkt/followups: add a follow-up for one of the caller's consultants (record only). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!ID.test(orgId)) return notFound();
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  return forward(`/api/orgs/${orgId}/mkt/followups`, { method: "POST", body: JSON.stringify(body) });
}
