import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

type Ctx = { params: Promise<{ orgId: string; id: string }> };
const ID = /^\d{1,18}$/;
const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

/** GET /api/orgs/{orgId}/mkt/resumes/{id}: the read-only preview. */
export async function GET(_req: Request, { params }: Ctx) {
  const { orgId, id } = await params;
  if (!ID.test(orgId) || !ID.test(id)) return notFound();
  return forward(`/api/orgs/${orgId}/mkt/resumes/${id}`, { headers: { accept: "application/json" } });
}

/** PATCH: metadata edit (title, headline, summary, targetRole). The BFF checks the shape only; bounds, PII and scope are the API's. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { orgId, id } = await params;
  if (!ID.test(orgId) || !ID.test(id)) return notFound();
  const body = await readObject(req);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["title", "headline", "summary", "targetRole"]);
  if (bad) return badBody(bad);
  return forward(`/api/orgs/${orgId}/mkt/resumes/${id}`, { method: "PATCH", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body) });
}
