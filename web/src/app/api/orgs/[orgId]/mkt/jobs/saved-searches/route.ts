import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/** POST /api/orgs/{orgId}/mkt/jobs/saved-searches {name, criteria}: save the current filters as one of the caller's searches. The API validates and scans the text. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(req);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["name", "criteria"]);
  if (bad) return badBody(bad);
  if (typeof body.name !== "string") return badBody("Give the search a name.");
  if (typeof body.criteria !== "object" || body.criteria === null || Array.isArray(body.criteria)) return badBody("Choose at least one filter to save.");
  return forward(`/api/orgs/${orgId}/mkt/jobs/saved-searches`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ name: body.name, criteria: body.criteria }) });
}
