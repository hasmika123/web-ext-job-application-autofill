import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

const ID = /^\d{1,18}$/;
const notFound = () => Response.json({ error: "Not found." }, { status: 404 });
const CREATE_FIELDS = ["title", "detail", "category", "priority", "status", "dueAt", "consultantId", "clientAccountId", "relatedLabel", "ownerMemberId"] as const;

/** GET /api/orgs/{orgId}/mkt/tasks?tab=&category=&priority=&status=&owner=&due=&q=&page=&size=&sort=: the Tasks board (one call). The API owns scope (ASSIGNED), permission and the tenant wall. */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!ID.test(orgId)) return notFound();
  return forward(`/api/orgs/${orgId}/mkt/tasks${new URL(request.url).search}`, { headers: { accept: "application/json" } });
}

/** POST /api/orgs/{orgId}/mkt/tasks: add a task (record only; it can never submit for a consultant or email anyone). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!ID.test(orgId)) return notFound();
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, CREATE_FIELDS);
  if (bad) return badBody(bad);
  return forward(`/api/orgs/${orgId}/mkt/tasks`, { method: "POST", body: JSON.stringify(body) });
}
