import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/**
 * POST /api/orgs/{orgId}/mkt/applications/{id}/notes: add a note (followups.manage). A RECORD only (E1): nothing here submits an
 * application or acts as a consultant. The BFF validates only the id shapes and the field names; the API owns permission, scope,
 * consent and the free-text scan.
 */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(req);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["body"]);
  if (bad) return badBody(bad);
  return forward(`/api/orgs/${orgId}/mkt/applications/${id}/notes`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body) });
}
