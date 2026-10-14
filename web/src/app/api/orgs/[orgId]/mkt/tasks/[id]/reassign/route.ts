import { badBody, forward, readObject } from "@/lib/admin-proxy";

/** POST /api/orgs/{orgId}/mkt/tasks/{id}/reassign {ownerMemberId}: hand a task to another marketer who can see its consultant (the API checks). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(request);
  if (!body || typeof body.ownerMemberId !== "number") return badBody("Send {ownerMemberId}.");
  return forward(`/api/orgs/${orgId}/mkt/tasks/${id}/reassign`, { method: "POST", body: JSON.stringify({ ownerMemberId: body.ownerMemberId }) });
}
