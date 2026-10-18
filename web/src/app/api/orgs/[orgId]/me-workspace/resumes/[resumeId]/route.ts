import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

type Ctx = { params: Promise<{ orgId: string; resumeId: string }> };

/** PATCH /api/orgs/{orgId}/me-workspace/resumes/{resumeId}: rename and/or change visibility of one of the caller's own resumes. */
export async function PATCH(request: Request, { params }: Ctx) {
  const { orgId, resumeId } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(resumeId)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["name", "visibility"]);
  if (bad) return badBody(bad);
  return forward(`/api/orgs/${orgId}/me-workspace/resumes/${resumeId}`, { method: "PATCH", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body) });
}
