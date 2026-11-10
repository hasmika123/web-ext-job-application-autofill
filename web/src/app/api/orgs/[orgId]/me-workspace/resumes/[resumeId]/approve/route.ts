import { forward, readObject } from "@/lib/admin-proxy";

/** POST /api/orgs/{orgId}/me-workspace/resumes/{resumeId}/approve: the consultant approves the version they reviewed (`{versionNo, contentHash}`). */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; resumeId: string }> }) {
  const { orgId, resumeId } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(resumeId)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(req);
  const reviewed = {
    ...(body && typeof body.versionNo === "number" ? { versionNo: body.versionNo } : {}),
    ...(body && typeof body.contentHash === "string" ? { contentHash: body.contentHash } : {}),
  };
  return forward(`/api/orgs/${orgId}/me-workspace/resumes/${resumeId}/approve`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(reviewed) });
}
