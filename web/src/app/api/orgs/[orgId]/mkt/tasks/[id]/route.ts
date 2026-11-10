import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

const ID = /^\d{1,18}$/;
const notFound = () => Response.json({ error: "Not found." }, { status: 404 });
const PATCH_FIELDS = ["title", "detail", "category", "priority", "status", "dueAt", "relatedLabel"] as const;

/** PATCH /api/orgs/{orgId}/mkt/tasks/{id}: edit a task (only the fields sent change; record only). */
export async function PATCH(request: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (!ID.test(orgId) || !ID.test(id)) return notFound();
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, PATCH_FIELDS);
  if (bad) return badBody(bad);
  return forward(`/api/orgs/${orgId}/mkt/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

/** DELETE /api/orgs/{orgId}/mkt/tasks/{id}: delete one of the caller's own open tasks (the API refuses anything else). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (!ID.test(orgId) || !ID.test(id)) return notFound();
  return forward(`/api/orgs/${orgId}/mkt/tasks/${id}`, { method: "DELETE" });
}
