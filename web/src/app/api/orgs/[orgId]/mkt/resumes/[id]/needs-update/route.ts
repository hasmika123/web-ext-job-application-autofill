import { forward, readObject } from "@/lib/admin-proxy";

/** POST .../needs-update: flag a resume for an update (optional {note}). */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string; id: string }> }) {
  const { orgId, id } = await params;
  if (!/^\d{1,18}$/.test(orgId) || !/^\d{1,18}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readObject(req);
  const note = body && typeof body.note === "string" ? { note: body.note } : {};
  return forward(`/api/orgs/${orgId}/mkt/resumes/${id}/needs-update`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(note) });
}
