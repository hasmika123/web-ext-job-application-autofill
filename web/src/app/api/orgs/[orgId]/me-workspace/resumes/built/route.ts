import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/**
 * POST /api/orgs/{orgId}/me-workspace/resumes/built: create a Resume Builder resume for the signed-in consultant (the personal builder's own create body:
 * `{templateId?, target?, label?, source?}`), under the organization license's cap, linked into the organization directory. Answers 201 `{orgResumeId,
 * resumeId, row}`; 402 `RESUME_LIMIT` / 422 `SENSITIVE_CONTENT` relay as the personal create does. The organization comes from the host (the API checks it).
 */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!/^\d{1,18}$/.test(orgId)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = (await readObject(request)) ?? {};
  const bad = onlyFields(body, ["templateId", "target", "label", "source"]);
  if (bad) return badBody(bad);
  return forward(`/api/orgs/${orgId}/me-workspace/resumes/built`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body) });
}
