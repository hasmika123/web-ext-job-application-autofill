import { forward, readObject } from "@/lib/admin-proxy";

/** POST /api/orgs/{orgId}/mkt/followups/{id}/reminder: record a reminder REQUEST. Nothing is emailed (E1: no outbound mail from this build). */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(request);
  return forward(`/api/orgs/${orgId}/mkt/followups/${id}/reminder`, { method: "POST", body: JSON.stringify({ note: typeof body?.note === "string" ? body.note : null }) });
}
