import { badBody, forward, readObject } from "@/lib/admin-proxy";

/** POST /api/orgs/{orgId}/mkt/followups/{id}/call: log a call and its note (record only). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  return forward(`/api/orgs/${orgId}/mkt/followups/${id}/call`, { method: "POST", body: JSON.stringify({ note: body.note, awaitingReply: body.awaitingReply === true }) });
}
