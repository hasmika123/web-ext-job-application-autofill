import { forward, readObject } from "@/lib/admin-proxy";

/** POST /api/orgs/{orgId}/me-workspace/resumes/{resumeId}/request-changes: the consultant sends a marketer's resume back (optional `{note}`). */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; resumeId: string }> }) {
  const { orgId, resumeId } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(resumeId)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(req);
  const note = body && typeof body.note === "string" ? { note: body.note } : {};
  return forward(`/api/orgs/${orgId}/me-workspace/resumes/${resumeId}/request-changes`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(note) });
}
