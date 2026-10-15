import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/**
 * POST .../mkt/resumes/consultants/{consultantId}/built: a marketer creates a resume for an ASSIGNED consultant (the personal builder's own create body),
 * saved under the consultant's account and waiting for their approval. The API gate decides (organization from the host, scope, the consultant's seat).
 */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string; consultantId: string }> }) {
  const { orgId, consultantId } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(consultantId)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = (await readObject(request)) ?? {};
  const bad = onlyFields(body, ["templateId", "target", "label", "source"]);
  if (bad) return badBody(bad);
  return forward(`/api/orgs/${orgId}/mkt/resumes/consultants/${consultantId}/built`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body) });
}
