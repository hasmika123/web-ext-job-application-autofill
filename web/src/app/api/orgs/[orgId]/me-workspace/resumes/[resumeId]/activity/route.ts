import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/** POST /api/orgs/{orgId}/me-workspace/resumes/{resumeId}/activity: record a VIEWED, DOWNLOADED or SHARED action. */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string; resumeId: string }> }) {
  const { orgId, resumeId } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(resumeId)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["kind"]);
  if (bad) return badBody(bad);
  return forward(`/api/orgs/${orgId}/me-workspace/resumes/${resumeId}/activity`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body) });
}
